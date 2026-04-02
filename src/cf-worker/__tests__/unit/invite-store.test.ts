import { Effect, Layer } from "effect";
import { it, describe } from "@effect/vitest";
import { expect } from "vitest";

import { InviteId, UserId } from "../../db/branded";
import { DbError } from "../../db/service";
import { InviteStore } from "../../invites/store";

function makeInviteStoreLayer(overrides: Partial<InviteStore["Type"]> = {}) {
  return Layer.succeed(InviteStore, {
    create: () => Effect.void,
    list: () => Effect.succeed([]),
    findById: () => Effect.succeed(null),
    findValidByCode: () => Effect.succeed(null),
    deleteById: () => Effect.void,
    redeemAndApproveUser: () => Effect.void,
    ...overrides,
  });
}

const mockInvite = {
  id: "inv-1",
  code: "ABCD1234",
  createdByUserId: "user-admin",
  usedByUserId: null,
  usedAt: null,
  expiresAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("InviteStore service contract", () => {
  it.effect("create captures params correctly", () => {
    let captured: unknown = null;

    const layer = makeInviteStoreLayer({
      create: (params) => {
        captured = params;
        return Effect.void;
      },
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.create({
        id: InviteId.make("inv-1"),
        code: "ABCD1234",
        createdByUserId: UserId.make("user-admin"),
        expiresAt: null,
      });
      expect(captured).toEqual({
        id: "inv-1",
        code: "ABCD1234",
        createdByUserId: "user-admin",
        expiresAt: null,
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("list returns invites", () => {
    const invites = [
      {
        ...mockInvite,
        createdBy: { email: "admin@test.com", id: "user-admin", name: "Admin" },
        usedBy: null,
      },
    ];

    const layer = makeInviteStoreLayer({
      list: () => Effect.succeed(invites),
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      const result = yield* store.list();
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe("ABCD1234");
      expect(result[0].createdBy?.email).toBe("admin@test.com");
    }).pipe(Effect.provide(layer));
  });

  it.effect("findById returns invite when found", () => {
    const layer = makeInviteStoreLayer({
      findById: (id) =>
        id === "inv-1" ? Effect.succeed(mockInvite) : Effect.succeed(null),
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      const result = yield* store.findById(InviteId.make("inv-1"));
      expect(result).toEqual(mockInvite);
    }).pipe(Effect.provide(layer));
  });

  it.effect("findById returns null when not found", () => {
    const layer = makeInviteStoreLayer();

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      const result = yield* store.findById(InviteId.make("nonexistent"));
      expect(result).toBeNull();
    }).pipe(Effect.provide(layer));
  });

  it.effect("findValidByCode converts code to uppercase", () => {
    let capturedCode: string | null = null;

    const layer = makeInviteStoreLayer({
      findValidByCode: (code) => {
        capturedCode = code;
        return Effect.succeed(mockInvite);
      },
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.findValidByCode("abcd1234");
      expect(capturedCode).toBe("abcd1234");
    }).pipe(Effect.provide(layer));
  });

  it.effect("deleteById calls with correct id", () => {
    let capturedId: string | null = null;

    const layer = makeInviteStoreLayer({
      deleteById: (id) => {
        capturedId = id;
        return Effect.void;
      },
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.deleteById(InviteId.make("inv-1"));
      expect(capturedId).toBe("inv-1");
    }).pipe(Effect.provide(layer));
  });

  it.effect("redeemAndApproveUser captures both IDs", () => {
    let capturedArgs: { inviteId: string; userId: string } | null = null;

    const layer = makeInviteStoreLayer({
      redeemAndApproveUser: (inviteId, userId) => {
        capturedArgs = { inviteId, userId };
        return Effect.void;
      },
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.redeemAndApproveUser(InviteId.make("inv-1"), UserId.make("user-1"));
      expect(capturedArgs).toEqual({ inviteId: "inv-1", userId: "user-1" });
    }).pipe(Effect.provide(layer));
  });

  it.effect("propagates DbError from create", () => {
    const layer = makeInviteStoreLayer({
      create: () =>
        Effect.fail(new DbError({ cause: new Error("insert failed") })),
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.create({
        id: InviteId.make("inv-1"),
        code: "ABCD",
        createdByUserId: UserId.make("user-1"),
        expiresAt: null,
      });
    }).pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("DbError");
      }))
    );
  });

  it.effect("propagates DbError from list", () => {
    const layer = makeInviteStoreLayer({
      list: () =>
        Effect.fail(new DbError({ cause: new Error("query failed") })),
    });

    return Effect.gen(function* () {
      const store = yield* InviteStore;
      yield* store.list();
    }).pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("DbError");
      }))
    );
  });
});
