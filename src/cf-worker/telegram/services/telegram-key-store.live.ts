import { Effect, Layer } from "effect";

import type { UserId } from "../../db/branded";
import type { Env } from "../../shared";
import { TelegramKeyStore } from "../services";

const forwardKey = (chatId: number) => `telegram:${chatId}`;
const reverseKey = (userId: UserId) => `telegram-user:${userId}`;

const readReverse = (env: Env, userId: UserId) =>
  Effect.promise(() => env.TELEGRAM_KV.get(reverseKey(userId))).pipe(
    Effect.map((raw) => {
      if (!raw) return [] as readonly number[];
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [] as readonly number[];
        return parsed.filter((v): v is number => typeof v === "number");
      } catch {
        return [] as readonly number[];
      }
    })
  );

export const TelegramKeyStoreLive = (env: Env) =>
  Layer.succeed(TelegramKeyStore, {
    put: (chatId, apiKey) =>
      Effect.promise(() => env.TELEGRAM_KV.put(forwardKey(chatId), apiKey)),
    remove: (chatId) =>
      Effect.promise(() => env.TELEGRAM_KV.delete(forwardKey(chatId))),
    linkUser: (userId, chatId) =>
      readReverse(env, userId).pipe(
        Effect.flatMap((existing) =>
          existing.includes(chatId)
            ? Effect.void
            : Effect.promise(() =>
                env.TELEGRAM_KV.put(
                  reverseKey(userId),
                  JSON.stringify([...existing, chatId])
                )
              )
        )
      ),
    unlinkUser: (userId, chatId) =>
      readReverse(env, userId).pipe(
        Effect.flatMap((existing) => {
          const next = existing.filter((id) => id !== chatId);
          if (next.length === existing.length) return Effect.void;
          if (next.length === 0) {
            return Effect.promise(() =>
              env.TELEGRAM_KV.delete(reverseKey(userId))
            );
          }
          return Effect.promise(() =>
            env.TELEGRAM_KV.put(reverseKey(userId), JSON.stringify(next))
          );
        })
      ),
    purgeForUser: (userId) =>
      readReverse(env, userId).pipe(
        Effect.flatMap((chatIds) =>
          Effect.forEach(
            chatIds,
            (chatId) =>
              Effect.promise(() => env.TELEGRAM_KV.delete(forwardKey(chatId))),
            { discard: true }
          ).pipe(
            Effect.zipRight(
              Effect.promise(() => env.TELEGRAM_KV.delete(reverseKey(userId)))
            ),
            Effect.as({ deletedCount: chatIds.length })
          )
        )
      ),
  });
