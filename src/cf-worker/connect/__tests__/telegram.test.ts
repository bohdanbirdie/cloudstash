import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import type { TierCapabilities } from "@/lib/plan";
import { capabilitiesFor } from "@/lib/plan";

import { Billing } from "../../billing/service";
import { OrgId, UserId } from "../../db/branded";
import {
  TelegramBotApi,
  TelegramBotApiError,
  TelegramKeyStore,
} from "../../telegram/services";
import { KeyCreationError } from "../errors";
import {
  ApiKeyStore,
  SessionProvider,
  TelegramConnectStore,
} from "../services";
import {
  checkRequest,
  confirmRequest,
  disconnectRequest,
  initiateRequest,
  statusRequest,
} from "../telegram";

const USER = UserId.make("user-1");
const ORG = OrgId.make("org-1");
const HEADERS = new Headers();

const sessionStub = (
  session: { userId: UserId; orgId: OrgId | null } | null = {
    userId: USER,
    orgId: ORG,
  }
) =>
  Layer.succeed(SessionProvider, {
    getSession: () => Effect.succeed(session),
  });

const billingStub = (caps: TierCapabilities = capabilitiesFor("plus")) => {
  const notImpl = <A>(): Effect.Effect<A> =>
    Effect.die("Billing stub method not implemented in test");
  return Layer.succeed(
    Billing,
    new Billing({
      capabilities: () => Effect.succeed(caps),
      tier: notImpl,
      subscription: notImpl,
      getOverrides: notImpl,
      setTier: notImpl,
      setOverride: notImpl,
      exists: notImpl,
      listWithOwners: notImpl,
    })
  );
};

interface ApiKeyState {
  created: { metadata: { orgId: OrgId; source: string }; name: string }[];
  deleted: string[];
}
const apiKeyStub = (args?: {
  keys?: { id: string; metadata: string | null }[];
  createResult?: { key: string; id: string } | null;
}) => {
  const state: ApiKeyState = { created: [], deleted: [] };
  const layer = Layer.succeed(ApiKeyStore, {
    listByUser: () => Effect.succeed(args?.keys ?? []),
    deleteById: (id) =>
      Effect.sync(() => {
        state.deleted.push(id);
      }),
    create: (_headers, metadata, name) =>
      Effect.suspend(() => {
        state.created.push({ metadata, name });
        if (args?.createResult === undefined) {
          return Effect.succeed({ key: "new-key", id: "new-key-id" });
        }
        if (args.createResult === null) {
          return Effect.fail(
            new KeyCreationError({
              cause: new Error("createApiKey returned null"),
            })
          );
        }
        return Effect.succeed(args.createResult);
      }),
    updateName: () => Effect.void,
  });
  return { layer, state };
};

interface ConnectStoreState {
  issued: number[];
  consumed: string[];
  records: Map<string, { recordId: string; chatId: number }>;
}
const connectStoreStub = (
  records?: Map<string, { recordId: string; chatId: number }>
) => {
  const state: ConnectStoreState = {
    issued: [],
    consumed: [],
    records: records ?? new Map(),
  };
  const layer = Layer.succeed(TelegramConnectStore, {
    issueCode: (chatId) =>
      Effect.sync(() => {
        for (const [existingCode, rec] of state.records.entries()) {
          if (rec.chatId === chatId) return existingCode;
        }
        state.issued.push(chatId);
        const code = `code-${state.issued.length}`;
        state.records.set(code, { recordId: `rec-${code}`, chatId });
        return code;
      }),
    findByCode: (code) => Effect.sync(() => state.records.get(code) ?? null),
    consumeByCode: (code) =>
      Effect.sync(() => {
        const rec = state.records.get(code);
        if (!rec) return null;
        state.records.delete(code);
        state.consumed.push(rec.recordId);
        return rec;
      }),
  });
  return { layer, state };
};

interface KeyStoreState {
  forward: Map<number, string>;
  reverse: Map<string, number[]>;
}
const keyStoreStub = (initial?: Partial<KeyStoreState>) => {
  const state: KeyStoreState = {
    forward: initial?.forward ?? new Map(),
    reverse: initial?.reverse ?? new Map(),
  };
  const layer = Layer.succeed(TelegramKeyStore, {
    put: (chatId, key) =>
      Effect.sync(() => {
        state.forward.set(chatId, key);
      }),
    remove: (chatId) =>
      Effect.sync(() => {
        state.forward.delete(chatId);
      }),
    linkUser: (userId, chatId) =>
      Effect.sync(() => {
        const existing = state.reverse.get(userId) ?? [];
        if (!existing.includes(chatId)) {
          state.reverse.set(userId, [...existing, chatId]);
        }
      }),
    unlinkUser: () => Effect.void,
    listForUser: (userId) => Effect.sync(() => state.reverse.get(userId) ?? []),
    purgeForUser: (userId) =>
      Effect.sync(() => {
        const chatIds = state.reverse.get(userId) ?? [];
        for (const id of chatIds) state.forward.delete(id);
        state.reverse.delete(userId);
        return { deletedCount: chatIds.length };
      }),
  });
  return { layer, state };
};

interface BotApiState {
  sent: { chatId: number; text: string }[];
}
const botApiStub = (args?: {
  username?: string | null;
  getMeFails?: boolean;
  sendMessageFails?: boolean;
}) => {
  const state: BotApiState = { sent: [] };
  const layer = Layer.succeed(TelegramBotApi, {
    sendMessage: (chatId, text) =>
      args?.sendMessageFails
        ? Effect.fail(
            new TelegramBotApiError({
              op: "sendMessage",
              cause: new Error("boom"),
            })
          )
        : Effect.sync(() => {
            state.sent.push({ chatId, text });
          }),
    getMe: () =>
      args?.getMeFails
        ? Effect.fail(
            new TelegramBotApiError({ op: "getMe", cause: new Error("boom") })
          )
        : Effect.succeed({ username: args?.username ?? "test_bot" }),
  });
  return { layer, state };
};

describe("initiateRequest", () => {
  it.effect("issues a code through the connect store", () => {
    const { layer, state } = connectStoreStub();
    return initiateRequest(42).pipe(
      Effect.provide(layer),
      Effect.tap((code) =>
        Effect.sync(() => {
          expect(code).toBe("code-1");
          expect(state.issued).toEqual([42]);
        })
      )
    );
  });

  it.effect("reuses an existing non-expired code for the same chatId", () => {
    const { layer, state } = connectStoreStub();
    return Effect.all([initiateRequest(42), initiateRequest(42)]).pipe(
      Effect.provide(layer),
      Effect.tap(([first, second]) =>
        Effect.sync(() => {
          expect(first).toBe(second);
          expect(state.issued).toEqual([42]);
        })
      )
    );
  });
});

describe("checkRequest", () => {
  it.effect("returns valid:true for a known code", () => {
    const records = new Map([["good", { recordId: "rec-good", chatId: 1 }]]);
    const layer = Layer.mergeAll(
      sessionStub(),
      connectStoreStub(records).layer
    );
    return checkRequest(HEADERS, "good").pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => expect(result).toEqual({ valid: true }))
      )
    );
  });

  it.effect("returns valid:false for missing or unknown code", () => {
    const layer = Layer.mergeAll(sessionStub(), connectStoreStub().layer);
    return Effect.all([
      checkRequest(HEADERS, null),
      checkRequest(HEADERS, "missing"),
    ]).pipe(
      Effect.provide(layer),
      Effect.tap(([a, b]) =>
        Effect.sync(() => {
          expect(a).toEqual({ valid: false });
          expect(b).toEqual({ valid: false });
        })
      )
    );
  });

  it.effect("fails with ConnectUnauthorizedError without a session", () => {
    const layer = Layer.mergeAll(sessionStub(null), connectStoreStub().layer);
    return checkRequest(HEADERS, "any").pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    );
  });
});

describe("confirmRequest", () => {
  const validRecords = () =>
    new Map([["good", { recordId: "rec-good", chatId: 42 }]]);

  const allDeps = (overrides?: {
    session?: { userId: UserId; orgId: OrgId | null } | null;
    records?: Map<string, { recordId: string; chatId: number }>;
    createResult?: { key: string; id: string } | null;
    sendMessageFails?: boolean;
    caps?: TierCapabilities;
  }) => {
    const { layer: connect, state: connectState } = connectStoreStub(
      overrides?.records
    );
    const { layer: apiKey, state: apiKeyState } = apiKeyStub({
      createResult: overrides?.createResult,
    });
    const { layer: keys, state: keysState } = keyStoreStub();
    const { layer: bot, state: botState } = botApiStub({
      sendMessageFails: overrides?.sendMessageFails,
    });
    const layer = Layer.mergeAll(
      sessionStub(overrides?.session),
      connect,
      apiKey,
      keys,
      bot,
      billingStub(overrides?.caps)
    );
    return { layer, connectState, apiKeyState, keysState, botState };
  };

  it.effect("happy path: writes binding, notifies bot, consumes code", () => {
    const { layer, connectState, apiKeyState, keysState, botState } = allDeps({
      records: validRecords(),
    });
    return confirmRequest(HEADERS, { code: "good" }).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(apiKeyState.created).toEqual([
            { metadata: { orgId: ORG, source: "telegram" }, name: "Telegram" },
          ]);
          expect(keysState.forward.get(42)).toBe("new-key");
          expect(keysState.reverse.get(USER)).toEqual([42]);
          expect(botState.sent).toEqual([
            { chatId: 42, text: "✅ Connected! Send me any link to save it." },
          ]);
          expect(connectState.consumed).toEqual(["rec-good"]);
        })
      )
    );
  });

  it.effect("succeeds even if the bot notify fails", () => {
    const { layer, keysState } = allDeps({
      records: validRecords(),
      sendMessageFails: true,
    });
    return confirmRequest(HEADERS, { code: "good" }).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(keysState.forward.get(42)).toBe("new-key");
        })
      )
    );
  });

  it.effect("fails InvalidCodeError when code is unknown", () => {
    const { layer } = allDeps();
    return confirmRequest(HEADERS, { code: "missing" }).pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("InvalidCodeError");
        })
      )
    );
  });

  it.effect(
    "second confirm with the same code fails InvalidCodeError (race-safe)",
    () => {
      const { layer, apiKeyState, keysState } = allDeps({
        records: validRecords(),
      });
      return Effect.gen(function* () {
        const first = yield* confirmRequest(HEADERS, { code: "good" });
        expect(first).toEqual({ ok: true });
        const second = yield* confirmRequest(HEADERS, { code: "good" }).pipe(
          Effect.flip
        );
        expect(second._tag).toBe("InvalidCodeError");
        // Only one binding and one API key created across both attempts.
        expect(apiKeyState.created).toHaveLength(1);
        expect(keysState.forward.get(42)).toBe("new-key");
      }).pipe(Effect.provide(layer));
    }
  );

  it.effect(
    "fails CapabilityDisabledError when org is on the free tier (no integrations)",
    () => {
      const { layer } = allDeps({
        records: validRecords(),
        caps: capabilitiesFor("free"),
      });
      return confirmRequest(HEADERS, { code: "good" }).pipe(
        Effect.provide(layer),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("CapabilityDisabledError");
            if (error._tag === "CapabilityDisabledError") {
              expect(error.capability).toBe("integrations");
              expect(error.requiredTier).toBe("plus");
            }
          })
        )
      );
    }
  );

  it.effect("fails KeyCreationError when apikey create returns null", () => {
    const { layer } = allDeps({
      records: validRecords(),
      createResult: null,
    });
    return confirmRequest(HEADERS, { code: "good" }).pipe(
      Effect.provide(layer),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("KeyCreationError");
        })
      )
    );
  });
});

describe("statusRequest", () => {
  it.effect("returns count + botUsername", () => {
    const { layer: keys } = keyStoreStub({
      reverse: new Map([[USER, [10, 20, 30]]]),
    });
    const layer = Layer.mergeAll(
      sessionStub(),
      keys,
      botApiStub({ username: "dev_bot" }).layer
    );
    return statusRequest(HEADERS).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ count: 3, botUsername: "dev_bot" });
        })
      )
    );
  });

  it.effect("falls back to null botUsername when getMe fails", () => {
    const layer = Layer.mergeAll(
      sessionStub(),
      keyStoreStub().layer,
      botApiStub({ getMeFails: true }).layer
    );
    return statusRequest(HEADERS).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ count: 0, botUsername: null });
        })
      )
    );
  });
});

describe("disconnectRequest", () => {
  it.effect(
    "clears KV bindings, revokes only telegram-source keys, notifies each chat",
    () => {
      const { layer: keys, state: keysState } = keyStoreStub({
        forward: new Map([
          [100, "k1"],
          [200, "k2"],
        ]),
        reverse: new Map([[USER, [100, 200]]]),
      });
      const { layer: apiKey, state: apiKeyState } = apiKeyStub({
        keys: [
          { id: "tg-1", metadata: JSON.stringify({ source: "telegram" }) },
          { id: "tg-2", metadata: JSON.stringify({ source: "telegram" }) },
          { id: "rc-1", metadata: JSON.stringify({ source: "raycast" }) },
          { id: "no-meta", metadata: null },
          { id: "bad-meta", metadata: "{not json" },
        ],
      });
      const { layer: bot, state: botState } = botApiStub();

      const layer = Layer.mergeAll(
        sessionStub(),
        keys,
        apiKey,
        bot,
        connectStoreStub().layer
      );

      return disconnectRequest(HEADERS).pipe(
        Effect.provide(layer),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toEqual({ ok: true });
            expect(keysState.forward.size).toBe(0);
            expect(keysState.reverse.size).toBe(0);
            expect(apiKeyState.deleted.toSorted()).toEqual(["tg-1", "tg-2"]);
            expect(
              botState.sent.map((m) => m.chatId).toSorted((a, b) => a - b)
            ).toEqual([100, 200]);
          })
        )
      );
    }
  );

  it.effect("notify failure does not block KV cleanup or key revoke", () => {
    const { layer: keys, state: keysState } = keyStoreStub({
      forward: new Map([[100, "k1"]]),
      reverse: new Map([[USER, [100]]]),
    });
    const { layer: apiKey, state: apiKeyState } = apiKeyStub({
      keys: [{ id: "tg-1", metadata: JSON.stringify({ source: "telegram" }) }],
    });
    const { layer: bot } = botApiStub({ sendMessageFails: true });

    const layer = Layer.mergeAll(
      sessionStub(),
      keys,
      apiKey,
      bot,
      connectStoreStub().layer
    );

    return disconnectRequest(HEADERS).pipe(
      Effect.provide(layer),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(keysState.forward.size).toBe(0);
          expect(apiKeyState.deleted).toEqual(["tg-1"]);
        })
      )
    );
  });
});
