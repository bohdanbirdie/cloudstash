import { Array as A, HashMap, Option, pipe } from "effect";

import type { LinkId, TagId } from "../db/branded";
import type { DigestLinkInput } from "./generator";

export interface DigestSourceData {
  readonly links: ReadonlyArray<{
    readonly id: LinkId;
    readonly url: string;
    readonly domain: string;
    readonly createdAt: Date;
  }>;
  readonly snapshots: ReadonlyArray<{
    readonly linkId: LinkId;
    readonly title: string | null;
    readonly fetchedAt: Date;
  }>;
  readonly summaries: ReadonlyArray<{
    readonly linkId: LinkId;
    readonly summary: string;
    readonly summarizedAt: Date;
  }>;
  readonly linkTags: ReadonlyArray<{
    readonly linkId: LinkId;
    readonly tagId: TagId;
  }>;
  readonly tags: ReadonlyArray<{
    readonly id: TagId;
    readonly name: string;
  }>;
}

type Snapshot = DigestSourceData["snapshots"][number];
type Summary = DigestSourceData["summaries"][number];

const emptyTags = (): ReadonlyArray<string> => [];

const tagNamePair = (t: {
  id: TagId;
  name: string;
}): readonly [TagId, string] => [t.id, t.name];

const keepLatestBy =
  <T>(timeOf: (x: T) => number, keyOf: (x: T) => LinkId) =>
  (acc: HashMap.HashMap<LinkId, T>, item: T) => {
    const key = keyOf(item);
    return pipe(
      HashMap.get(acc, key),
      Option.match({
        onNone: () => HashMap.set(acc, key, item),
        onSome: (prev) =>
          timeOf(item) > timeOf(prev) ? HashMap.set(acc, key, item) : acc,
      })
    );
  };

export function buildDigestLinks(
  data: DigestSourceData,
  cutoffMs: number
): ReadonlyArray<DigestLinkInput> {
  const recent = A.filter(data.links, (l) => l.createdAt.getTime() >= cutoffMs);
  if (recent.length === 0) return [];

  const latestSnapshot = A.reduce(
    data.snapshots,
    HashMap.empty<LinkId, Snapshot>(),
    keepLatestBy<Snapshot>(
      (s) => s.fetchedAt.getTime(),
      (s) => s.linkId
    )
  );

  const latestSummary = A.reduce(
    data.summaries,
    HashMap.empty<LinkId, Summary>(),
    keepLatestBy<Summary>(
      (s) => s.summarizedAt.getTime(),
      (s) => s.linkId
    )
  );

  const tagNameById = HashMap.fromIterable(A.map(data.tags, tagNamePair));

  const tagsByLink = A.reduce(
    data.linkTags,
    HashMap.empty<LinkId, ReadonlyArray<string>>(),
    (acc, lt) =>
      pipe(
        HashMap.get(tagNameById, lt.tagId),
        Option.match({
          onNone: () => acc,
          onSome: (name) => {
            const existing = pipe(
              HashMap.get(acc, lt.linkId),
              Option.getOrElse(emptyTags)
            );
            return HashMap.set(acc, lt.linkId, A.append(existing, name));
          },
        })
      )
  );

  return A.filterMap(recent, (link) =>
    pipe(
      HashMap.get(latestSnapshot, link.id),
      Option.flatMap((snap) => Option.fromNullable(snap.title)),
      Option.map((title) => ({
        domain: link.domain,
        summary: pipe(
          HashMap.get(latestSummary, link.id),
          Option.map((s) => s.summary),
          Option.getOrElse(() => "")
        ),
        tags: pipe(
          HashMap.get(tagsByLink, link.id),
          Option.getOrElse(emptyTags)
        ),
        title,
        url: link.url,
      }))
    )
  );
}
