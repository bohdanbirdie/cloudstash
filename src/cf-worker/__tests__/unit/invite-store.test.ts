import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

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
  it("create captures params correctly", async () => {
    let captured: unknown = null;

    const layer = makeInviteStoreLayer({
      create: (params) => {
        captured = params;
        return Effect.void;
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.create({
          id: InviteId.make("inv-1"),
          code: "ABCD1234",
          createdByUserId: UserId.make("user-admin"),
          expiresAt: null,
        });
      }).pipe(Effect.provide(layer))
    );

    expect(captured).toEqual({
      id: "inv-1",
      code: "ABCD1234",
      createdByUserId: "user-admin",
      expiresAt: null,
    });
  });

  it("list returns invites", async () => {
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

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        return yield* store.list();
      }).pipe(Effect.provide(layer))
    );

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("ABCD1234");
    expect(result[0].createdBy?.email).toBe("admin@test.com");
  });

  it("findById returns invite when found", async () => {
    const layer = makeInviteStoreLayer({
      findById: (id) =>
        id === "inv-1" ? Effect.succeed(mockInvite) : Effect.succeed(null),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        return yield* store.findById(InviteId.make("inv-1"));
      }).pipe(Effect.provide(layer))
    );

    expect(result).toEqual(mockInvite);
  });

  it("findById returns null when not found", async () => {
    const layer = makeInviteStoreLayer();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        return yield* store.findById(InviteId.make("nonexistent"));
      }).pipe(Effect.provide(layer))
    );

    expect(result).toBeNull();
  });

  it("findValidByCode converts code to uppercase", async () => {
    let capturedCode: string | null = null;

    const layer = makeInviteStoreLayer({
      findValidByCode: (code) => {
        capturedCode = code;
        return Effect.succeed(mockInvite);
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.findValidByCode("abcd1234");
      }).pipe(Effect.provide(layer))
    );

    expect(capturedCode).toBe("abcd1234");
  });

  it("deleteById calls with correct id", async () => {
    let capturedId: string | null = null;

    const layer = makeInviteStoreLayer({
      deleteById: (id) => {
        capturedId = id;
        return Effect.void;
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.deleteById(InviteId.make("inv-1"));
      }).pipe(Effect.provide(layer))
    );

    expect(capturedId).toBe("inv-1");
  });

  it("redeemAndApproveUser captures both IDs", async () => {
    let capturedArgs: { inviteId: string; userId: string } | null = null;

    const layer = makeInviteStoreLayer({
      redeemAndApproveUser: (inviteId, userId) => {
        capturedArgs = { inviteId, userId };
        return Effect.void;
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.redeemAndApproveUser(InviteId.make("inv-1"), UserId.make("user-1"));
      }).pipe(Effect.provide(layer))
    );

    expect(capturedArgs).toEqual({ inviteId: "inv-1", userId: "user-1" });
  });

  it("propagates DbError from create", async () => {
    const layer = makeInviteStoreLayer({
      create: () =>
        Effect.fail(new DbError({ cause: new Error("insert failed") })),
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.create({
          id: InviteId.make("inv-1"),
          code: "ABCD",
          createdByUserId: UserId.make("user-1"),
          expiresAt: null,
        });
      }).pipe(Effect.provide(layer), Effect.flip)
    );

    expect(error._tag).toBe("DbError");
  });

  it("propagates DbError from list", async () => {
    const layer = makeInviteStoreLayer({
      list: () =>
        Effect.fail(new DbError({ cause: new Error("query failed") })),
    });

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const store = yield* InviteStore;
        yield* store.list();
      }).pipe(Effect.provide(layer), Effect.flip)
    );

    expect(error._tag).toBe("DbError");
  });
});
