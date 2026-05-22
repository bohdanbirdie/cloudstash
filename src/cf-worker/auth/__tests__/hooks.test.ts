import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer, LogLevel, Logger } from "effect";

import { UserId } from "../../db/branded";
import { DbClient, DbError } from "../../db/service";
import { AppSettings } from "../../settings/service";
import {
  autoApproveUser,
  CreateOrganizationError,
  resolveActiveOrg,
  startXBookmarkSyncForAccount,
  XBookmarkSyncStartError,
} from "../hooks";
import type { ResolveActiveOrgDeps } from "../hooks";

const USER_ID = UserId.make("user-1");
const ORG_ID = "org-1";

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Logger.withMinimumLogLevel(LogLevel.None));

const settingsStub = (gateEnabled: boolean) =>
  Layer.succeed(
    AppSettings,
    new AppSettings({
      signupGateEnabled: () => Effect.succeed(gateEnabled),
      setSignupGateEnabled: () => Effect.void,
    })
  );

describe("autoApproveUser", () => {
  it.effect("approves the user when the gate is open", () => {
    const updates: UserId[] = [];
    const db = Layer.succeed(DbClient, {
      update: () => ({
        set: () => ({
          where: () => {
            updates.push(USER_ID);
            return Promise.resolve(undefined);
          },
        }),
      }),
    } as never);

    return autoApproveUser(USER_ID).pipe(
      Effect.provide(Layer.mergeAll(settingsStub(false), db)),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updates).toHaveLength(1);
        })
      )
    );
  });

  it.effect("is a no-op when the gate is enabled (approval required)", () => {
    let updateCalled = false;
    const db = Layer.succeed(DbClient, {
      update: () => {
        updateCalled = true;
        return { set: () => ({ where: () => Promise.resolve(undefined) }) };
      },
    } as never);

    return autoApproveUser(USER_ID).pipe(
      Effect.provide(Layer.mergeAll(settingsStub(true), db)),
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updateCalled).toBe(false);
        })
      )
    );
  });

  it.effect("fails with DbError when the approval write throws", () => {
    const db = Layer.succeed(DbClient, {
      update: () => ({
        set: () => ({
          where: () => Promise.reject(new Error("D1 down")),
        }),
      }),
    } as never);

    return autoApproveUser(USER_ID).pipe(
      Effect.provide(Layer.mergeAll(settingsStub(false), db)),
      quiet,
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(DbError);
          }
        })
      )
    );
  });
});

describe("startXBookmarkSyncForAccount", () => {
  interface NsRec {
    started: number;
    ids: string[];
  }

  const namespaceStub = (rec: NsRec, startResult: Promise<void> | "throw") =>
    ({
      idFromName: (name: string) => {
        rec.ids.push(name);
        return { name };
      },
      get: () => ({
        start: () => {
          rec.started += 1;
          return startResult === "throw"
            ? Promise.reject(new Error("DO unavailable"))
            : startResult;
        },
      }),
    }) as never;

  it.effect("ignores non-X providers", () => {
    const rec: NsRec = { started: 0, ids: [] };
    return startXBookmarkSyncForAccount(
      { providerId: "google", userId: "user-1" },
      namespaceStub(rec, Promise.resolve())
    ).pipe(
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rec.started).toBe(0);
          expect(rec.ids).toEqual([]);
        })
      )
    );
  });

  it.effect("starts the DO keyed by userId for an X account", () => {
    const rec: NsRec = { started: 0, ids: [] };
    return startXBookmarkSyncForAccount(
      { providerId: "x", userId: "user-1" },
      namespaceStub(rec, Promise.resolve())
    ).pipe(
      quiet,
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rec.started).toBe(1);
          expect(rec.ids).toEqual(["user-1"]);
        })
      )
    );
  });

  it.effect("fails with XBookmarkSyncStartError when start() rejects", () => {
    const rec: NsRec = { started: 0, ids: [] };
    return startXBookmarkSyncForAccount(
      { providerId: "x", userId: "user-1" },
      namespaceStub(rec, "throw")
    ).pipe(
      quiet,
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(XBookmarkSyncStartError);
          }
        })
      )
    );
  });
});

describe("resolveActiveOrg", () => {
  interface MemberRow {
    organizationId: string;
  }

  interface DbStubOptions {
    members?: (MemberRow | undefined)[];
    org?: { id: string } | undefined;
    user?: { name?: string } | undefined;
    insertError?: unknown;
    memberLookupError?: unknown;
  }

  interface DbRec {
    inserts: { organizationId: string }[];
  }

  const makeDb = (rec: DbRec, opts: DbStubOptions = {}) => {
    const members = opts.members ?? [];
    let memberCall = 0;
    return Layer.succeed(DbClient, {
      query: {
        member: {
          findFirst: () => {
            if (opts.memberLookupError) {
              return Promise.reject(opts.memberLookupError);
            }
            return Promise.resolve(members[memberCall++]);
          },
        },
        organization: {
          findFirst: () => Promise.resolve(opts.org),
        },
        user: {
          findFirst: () => Promise.resolve(opts.user),
        },
      },
      insert: () => ({
        values: (row: { organizationId: string }) => {
          if (opts.insertError) return Promise.reject(opts.insertError);
          rec.inserts.push({ organizationId: row.organizationId });
          return Promise.resolve(undefined);
        },
      }),
    } as never);
  };

  const stubDeps = (
    rec: { creates: { slug: string }[] },
    result: { id: string } | "throw" = { id: ORG_ID }
  ): ResolveActiveOrgDeps => ({
    createOrganization: (input) => {
      rec.creates.push({ slug: input.slug });
      return result === "throw"
        ? Promise.reject(new Error("createOrganization failed"))
        : Promise.resolve(result);
    },
  });

  it.effect("returns the existing membership org without repairing", () => {
    const dbRec: DbRec = { inserts: [] };
    const depRec = { creates: [] as { slug: string }[] };

    return resolveActiveOrg({ userId: "user-1" }, stubDeps(depRec)).pipe(
      Effect.provide(makeDb(dbRec, { members: [{ organizationId: ORG_ID }] })),
      quiet,
      Effect.tap((orgId) =>
        Effect.sync(() => {
          expect(orgId).toBe(ORG_ID);
          expect(dbRec.inserts).toEqual([]);
          expect(depRec.creates).toEqual([]);
        })
      )
    );
  });

  it.effect("repairs a missing member row when the org already exists", () => {
    const dbRec: DbRec = { inserts: [] };
    const depRec = { creates: [] as { slug: string }[] };

    return resolveActiveOrg({ userId: "user-1" }, stubDeps(depRec)).pipe(
      Effect.provide(
        makeDb(dbRec, {
          members: [undefined, { organizationId: ORG_ID }],
          org: { id: ORG_ID },
        })
      ),
      quiet,
      Effect.tap((orgId) =>
        Effect.sync(() => {
          expect(orgId).toBe(ORG_ID);
          expect(dbRec.inserts).toEqual([{ organizationId: ORG_ID }]);
          // Repair path must not call createOrganization (it would 409).
          expect(depRec.creates).toEqual([]);
        })
      )
    );
  });

  it.effect("creates an organization when none exists", () => {
    const dbRec: DbRec = { inserts: [] };
    const depRec = { creates: [] as { slug: string }[] };

    return resolveActiveOrg({ userId: "user-1" }, stubDeps(depRec)).pipe(
      Effect.provide(
        makeDb(dbRec, {
          members: [undefined, { organizationId: ORG_ID }],
          org: undefined,
          user: { name: "Ada" },
        })
      ),
      quiet,
      Effect.tap((orgId) =>
        Effect.sync(() => {
          expect(orgId).toBe(ORG_ID);
          expect(dbRec.inserts).toEqual([]);
          expect(depRec.creates).toEqual([{ slug: "user-user-1" }]);
        })
      )
    );
  });

  it.effect(
    "swallows a createOrganization failure and resolves via re-fetch",
    () => {
      // Models the concurrent first-session race: our create throws because a
      // parallel session already created the org+membership; the final lookup
      // recovers the winner's row.
      const dbRec: DbRec = { inserts: [] };
      const depRec = { creates: [] as { slug: string }[] };

      return resolveActiveOrg(
        { userId: "user-1" },
        stubDeps(depRec, "throw")
      ).pipe(
        Effect.provide(
          makeDb(dbRec, {
            members: [undefined, { organizationId: ORG_ID }],
            org: undefined,
            user: { name: "Ada" },
          })
        ),
        quiet,
        Effect.tap((orgId) =>
          Effect.sync(() => {
            expect(orgId).toBe(ORG_ID);
            expect(depRec.creates).toHaveLength(1);
          })
        )
      );
    }
  );

  it.effect("returns null when no membership can be resolved", () => {
    const dbRec: DbRec = { inserts: [] };
    const depRec = { creates: [] as { slug: string }[] };

    return resolveActiveOrg(
      { userId: "user-1" },
      stubDeps(depRec, "throw")
    ).pipe(
      Effect.provide(
        makeDb(dbRec, {
          members: [undefined, undefined],
          org: undefined,
          user: undefined,
        })
      ),
      quiet,
      Effect.tap((orgId) =>
        Effect.sync(() => {
          expect(orgId).toBeNull();
        })
      )
    );
  });

  it.effect("propagates DbError from the initial membership lookup", () => {
    const dbRec: DbRec = { inserts: [] };
    const depRec = { creates: [] as { slug: string }[] };

    return resolveActiveOrg({ userId: "user-1" }, stubDeps(depRec)).pipe(
      Effect.provide(
        makeDb(dbRec, { memberLookupError: new Error("connection lost") })
      ),
      quiet,
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(DbError);
          }
        })
      )
    );
  });
});

describe("CreateOrganizationError", () => {
  it("carries the underlying cause", () => {
    const cause = new Error("boom");
    const err = new CreateOrganizationError({ cause });
    expect(err._tag).toBe("CreateOrganizationError");
    expect(err.cause).toBe(cause);
  });
});
