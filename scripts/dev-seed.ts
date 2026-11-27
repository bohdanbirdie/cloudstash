// Moves a library between a plain links file and a local dev server, over the
// same /sync connection the web app uses. The file holds links, not events, so
// it outlives schema changes: seeding writes today's events for each link.
//
//   bun scripts/dev-seed.ts export [file]   library -> file
//   bun scripts/dev-seed.ts seed [file]     file -> empty library
//
// With --if-empty, seed skips a library that has links without an error, and
// the empty test account's library (tools/dev-seed/accounts.ts); the dev server
// runs it that way on every library's first connection
// (tools/dev-seed/vite-plugin.ts).
//
// Server: DEV_URL (default http://127.0.0.1:$PORT or :3000). Account: the
// SEED_COOKIE header if set, else a test account (needs ENABLE_TEST_AUTH=true).
// Seeded links arrive already processed, so no page fetch or AI summary runs.
import { makeWsSync } from "@livestore/sync-cf/client";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { events } from "../src/livestore/schema";
import { EMPTY_ACCOUNT } from "../tools/dev-seed/accounts";

type LinkRecord = {
  url: string;
  createdAt: string;
  source: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  summary: string | null;
  summaryModel: string | null;
  failed: string | null;
  completedAt: string | null;
  tags: string[];
};

type EncodedEvent = { name: string; args: unknown };

const argv = process.argv.slice(2);
const ifEmpty = argv.includes("--if-empty");
const [command, file = "local/dev-data/links.jsonl"] = argv.filter(
  (arg) => !arg.startsWith("--")
);
const base =
  process.env.DEV_URL ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
const origin = process.env.BETTER_AUTH_URL ?? base;

const signIn = async (): Promise<string> => {
  if (process.env.SEED_COOKIE) return process.env.SEED_COOKIE;
  const email = process.env.SEED_EMAIL ?? "dev@cloudstash.test";
  const password = process.env.SEED_PASSWORD ?? "dev-password-123";
  const post = (path: string, body: object) =>
    fetch(`${base}/api/auth/${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Origin: origin },
      method: "POST",
    });
  let res = await post("sign-in/email", { email, password });
  if (!res.ok)
    res = await post("sign-up/email", { email, name: "Dev", password });
  if (!res.ok) {
    throw new Error(
      `Could not sign in as ${email} (${res.status}). Set SEED_COOKIE or run the server with ENABLE_TEST_AUTH=true.`
    );
  }
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
};

const cookie = await signIn();
const me = (await (
  await fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } })
).json()) as { organization?: { id: string }; user?: { email?: string } };
const storeId = me.organization?.id;
if (command === "seed" && ifEmpty && me.user?.email === EMPTY_ACCOUNT.email) {
  console.log(`Dev seed: ${EMPTY_ACCOUNT.email} stays empty.`);
  process.exit(0);
}
if (!storeId) throw new Error("Signed in, but the account has no library.");

const BaseSocket = globalThis.WebSocket;
globalThis.WebSocket = class extends BaseSocket {
  constructor(url: string | URL) {
    super(url, { headers: { Cookie: cookie, Origin: origin } } as never);
  }
} as typeof WebSocket;

const withBackend = <A>(
  use: (
    backend: Effect.Success<ReturnType<ReturnType<typeof makeWsSync>>>
  ) => Effect.Effect<A, unknown>
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const backend = yield* makeWsSync({
        ping: { enabled: false },
        url: `${base}/sync`,
      })({ clientId: "dev-seed", payload: undefined, storeId });
      return yield* use(backend);
    }).pipe(
      Effect.scoped,
      Effect.provide(KeyValueStore.layerMemory)
    ) as Effect.Effect<A>
  );

const pullAll = (backend: Parameters<Parameters<typeof withBackend>[0]>[0]) =>
  Effect.gen(function* () {
    const all: { name: string; args: any; seqNum: number }[] = [];
    yield* backend.pull(Option.none()).pipe(
      Stream.takeUntil((item) => item.pageInfo._tag === "NoMore"),
      Stream.runForEach((item) =>
        Effect.sync(() => {
          for (const { eventEncoded } of item.batch) {
            all.push(eventEncoded as never);
          }
        })
      )
    );
    return all;
  });

type Library = {
  links: Map<string, LinkRecord>;
  deleted: Set<string>;
  tags: Map<string, { name: string; deleted: boolean }>;
  tagLinks: Map<string, { linkId: string; tagId: string }>;
};

const createLink = (lib: Library, args: any) => {
  if ([...lib.links.values()].some((l) => l.url === args.url)) return;
  lib.links.set(args.id, {
    completedAt: null,
    createdAt: args.createdAt,
    description: null,
    failed: null,
    favicon: null,
    image: null,
    source: args.source ?? "app",
    summary: null,
    summaryModel: null,
    tags: [],
    title: null,
    url: args.url,
  });
};

const onLink =
  (update: (link: LinkRecord, args: any, lib: Library) => void) =>
  (lib: Library, args: any) => {
    const id = args.linkId ?? args.id;
    const link = lib.links.get(id);
    if (link) update(link, args, lib);
  };

const onTag =
  (update: (tag: { name: string; deleted: boolean }, args: any) => void) =>
  (lib: Library, args: any) => {
    const tag = lib.tags.get(args.id);
    if (tag) update(tag, args);
  };

const untag = onLink((link, args) => {
  link.tags = link.tags.filter((t) => t !== args.tagId);
});

const folds: Record<string, (lib: Library, args: any) => void> = {
  "v1.LinkCompleted": onLink((link, args) => {
    link.completedAt = args.completedAt;
  }),
  "v1.LinkCreated": createLink,
  "v1.LinkDeleted": onLink((_, args, lib) => lib.deleted.add(args.id)),
  "v1.LinkMetadataFetched": onLink((link, args) => {
    Object.assign(link, {
      description: args.description,
      favicon: args.favicon,
      image: args.image,
      title: args.title,
    });
  }),
  "v1.LinkProcessingCompleted": onLink((link) => {
    link.failed = null;
  }),
  "v1.LinkProcessingFailed": onLink((link, args) => {
    link.failed = args.error;
  }),
  "v1.LinkRestored": onLink((_, args, lib) => lib.deleted.delete(args.id)),
  "v1.LinkSummarized": onLink((link, args) => {
    Object.assign(link, { summary: args.summary, summaryModel: args.model });
  }),
  "v1.LinkTagged": onLink((link, args, lib) => {
    link.tags.push(args.tagId);
    lib.tagLinks.set(args.id, { linkId: args.linkId, tagId: args.tagId });
  }),
  "v1.LinkUncompleted": onLink((link) => {
    link.completedAt = null;
  }),
  "v1.LinkUntagged": (lib, args) => {
    const tagLink = lib.tagLinks.get(args.id);
    if (tagLink) untag(lib, tagLink);
  },
  "v1.TagCreated": (lib, args) => {
    lib.tags.set(args.id, { deleted: false, name: args.name });
  },
  "v1.TagDeleted": onTag((tag) => {
    tag.deleted = true;
  }),
  "v1.TagRenamed": onTag((tag, args) => {
    tag.name = args.name;
  }),
  "v2.LinkCreated": createLink,
  "v2.LinkUntagged": untag,
};

const exportLibrary = async () => {
  const log = await withBackend(pullAll);
  const lib: Library = {
    deleted: new Set(),
    links: new Map(),
    tagLinks: new Map(),
    tags: new Map(),
  };
  for (const { name, args } of log) folds[name]?.(lib, args);
  const lines = [...lib.links]
    .filter(([id]) => !lib.deleted.has(id))
    .map(([, link]) => ({
      ...link,
      tags: [...new Set(link.tags)].flatMap((id) => {
        const tag = lib.tags.get(id);
        return tag && !tag.deleted ? [tag.name] : [];
      }),
    }));
  await Bun.write(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(
    `Exported ${lines.length} links from ${log.length} events to ${file}`
  );
};

const encode = (event: { name: string; args: unknown }): EncodedEvent => {
  const def = Object.values(events).find((e) => e.name === event.name)!;
  return {
    args: Schema.encodeUnknownSync(def.schema as never)(event.args),
    name: event.name,
  };
};

const seedLibrary = async () => {
  const records = (await Bun.file(file).text())
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LinkRecord);
  const tagIds = new Map<string, string>();
  const tagEvents: EncodedEvent[] = [];
  for (const name of [...new Set(records.flatMap((r) => r.tags))].toSorted(
    (a, b) => a.localeCompare(b)
  )) {
    const id = crypto.randomUUID();
    tagIds.set(name, id);
    tagEvents.push(
      encode(
        events.tagCreated({
          createdAt: new Date(),
          id,
          name,
          sortOrder: tagIds.size,
        })
      )
    );
  }
  const linkBatches = records.map((r) => {
    const linkId = crypto.randomUUID();
    const at = new Date(r.createdAt);
    const batch = [
      events.linkProcessingCancelled({ linkId, updatedAt: at }),
      events.linkSourceNotified({ linkId, notifiedAt: at }),
      events.linkCreatedV2({
        createdAt: at,
        domain: new URL(r.url).hostname.replace(/^www\./, ""),
        id: linkId,
        source: r.source,
        sourceMeta: null,
        url: r.url,
      }),
    ];
    if (
      r.title !== null ||
      r.description !== null ||
      r.image !== null ||
      r.favicon !== null
    ) {
      batch.push(
        events.linkMetadataFetched({
          description: r.description,
          favicon: r.favicon,
          fetchedAt: at,
          id: crypto.randomUUID(),
          image: r.image,
          linkId,
          title: r.title,
        })
      );
    }
    if (r.summary !== null) {
      batch.push(
        events.linkSummarized({
          id: crypto.randomUUID(),
          linkId,
          model: r.summaryModel ?? "seed",
          summarizedAt: at,
          summary: r.summary,
        })
      );
    }
    batch.push(
      r.failed === null
        ? events.linkProcessingCompleted({ linkId, updatedAt: at })
        : events.linkProcessingFailed({
            error: r.failed,
            linkId,
            updatedAt: at,
          })
    );
    if (r.completedAt !== null)
      batch.push(
        events.linkCompleted({
          completedAt: new Date(r.completedAt),
          id: linkId,
        })
      );
    for (const name of r.tags) {
      batch.push(
        events.linkTagged({
          createdAt: at,
          id: crypto.randomUUID(),
          linkId,
          tagId: tagIds.get(name)!,
        })
      );
    }
    return batch.map(encode);
  });

  const seeded = await withBackend((backend) =>
    Effect.gen(function* () {
      const log = yield* pullAll(backend);
      if (log.some((e) => e.name.endsWith("LinkCreated"))) {
        if (ifEmpty) return false;
        return yield* Effect.fail(
          new Error("This library already has links; seed only an empty one.")
        );
      }
      let head = log.at(-1)?.seqNum ?? 0;
      const push = (batch: EncodedEvent[]) =>
        Effect.gen(function* () {
          const numbered = batch.map((e, i) => ({
            ...e,
            clientId: "dev-seed",
            parentSeqNum: head + i,
            seqNum: head + i + 1,
            sessionId: "dev-seed",
          }));
          yield* backend.push(numbered as never);
          head += batch.length;
        });
      yield* push(tagEvents);
      let chunk: EncodedEvent[] = [];
      for (const batch of linkBatches) {
        if (chunk.length + batch.length > 100) {
          yield* push(chunk);
          chunk = [];
        }
        chunk.push(...batch);
      }
      if (chunk.length > 0) yield* push(chunk);
      return true;
    })
  );
  if (!seeded) return;
  console.log(
    `Seeded ${records.length} links and ${tagIds.size} tags into ${base}`
  );
};

if (command === "export") await exportLibrary();
else if (command === "seed") await seedLibrary();
else console.log("Usage: bun scripts/dev-seed.ts export|seed [file]");
process.exit(0);
