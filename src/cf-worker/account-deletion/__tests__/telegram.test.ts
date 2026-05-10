import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { OrgId, UserId } from "../../db/branded";
import { TelegramKeyStore } from "../../telegram/services";
import { purgeTelegramForUser } from "../telegram";

interface StubState {
  stored: Map<number, string>;
  reverseIndex: Map<string, number[]>;
}

const createStubKeyStore = (initial?: {
  stored?: Map<number, string>;
  reverseIndex?: Map<string, number[]>;
}): { layer: Layer.Layer<TelegramKeyStore>; state: StubState } => {
  const state: StubState = {
    stored: initial?.stored ?? new Map(),
    reverseIndex: initial?.reverseIndex ?? new Map(),
  };
  const layer = Layer.succeed(TelegramKeyStore, {
    put: (chatId, apiKey) =>
      Effect.sync(() => {
        state.stored.set(chatId, apiKey);
      }),
    remove: (chatId) =>
      Effect.sync(() => {
        state.stored.delete(chatId);
      }),
    linkUser: (userId, chatId) =>
      Effect.sync(() => {
        const existing = state.reverseIndex.get(userId) ?? [];
        if (!existing.includes(chatId)) {
          state.reverseIndex.set(userId, [...existing, chatId]);
        }
      }),
    unlinkUser: (userId, chatId) =>
      Effect.sync(() => {
        const existing = state.reverseIndex.get(userId) ?? [];
        const next = existing.filter((id) => id !== chatId);
        if (next.length === 0) state.reverseIndex.delete(userId);
        else state.reverseIndex.set(userId, next);
      }),
    purgeForUser: (userId) =>
      Effect.sync(() => {
        const chatIds = state.reverseIndex.get(userId) ?? [];
        for (const chatId of chatIds) state.stored.delete(chatId);
        state.reverseIndex.delete(userId);
        return { deletedCount: chatIds.length };
      }),
  });
  return { layer, state };
};

describe("purgeTelegramForUser", () => {
  it.effect("returns { deletedCount: 0 } when the user has no chats", () => {
    const { layer } = createStubKeyStore();
    return purgeTelegramForUser({
      userId: UserId.make("user-1"),
      orgId: OrgId.make("org-1"),
    }).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ deletedCount: 0 });
        })
      )
    );
  });

  it.effect(
    "deletes every forward `telegram:${chatId}` entry plus the reverse index",
    () => {
      const userId = UserId.make("user-1");
      const { layer, state } = createStubKeyStore({
        stored: new Map([
          [101, "sk_a"],
          [202, "sk_b"],
          [999, "sk_other_user"],
        ]),
        reverseIndex: new Map([
          [userId, [101, 202]],
          ["user-2", [999]],
        ]),
      });

      return purgeTelegramForUser({
        userId,
        orgId: OrgId.make("org-1"),
      }).pipe(
        Effect.provide(layer),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toEqual({ deletedCount: 2 });
            expect(state.stored.has(101)).toBe(false);
            expect(state.stored.has(202)).toBe(false);
            // other user's chat untouched
            expect(state.stored.get(999)).toBe("sk_other_user");
            expect(state.reverseIndex.has(userId)).toBe(false);
            expect(state.reverseIndex.get("user-2")).toEqual([999]);
          })
        )
      );
    }
  );
});
