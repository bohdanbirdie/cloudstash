import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect, vi } from "vitest";

import { AuthClient } from "../../auth/service";
import { UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { getAccessTokenEffect } from "../effects";

const USER_ID = UserId.make("user-1");

const dbLayer = (findFirst: ReturnType<typeof vi.fn>) =>
  Layer.succeed(DbClient, {
    query: { account: { findFirst } },
  } as unknown as DbClient["Service"]);

const authLayer = (getAccessToken: ReturnType<typeof vi.fn>) =>
  Layer.succeed(AuthClient, {
    api: { getAccessToken },
  } as unknown as AuthClient["Service"]);

describe("getAccessTokenEffect", () => {
  it.effect("selects the local X account row id for Better Auth", () => {
    const findFirst = vi.fn(() => Promise.resolve({ id: "local-x-row" }));
    const getAccessToken = vi.fn(() =>
      Promise.resolve({ accessToken: "access-token" })
    );

    return getAccessTokenEffect(USER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
      ),
      Effect.tap((token) =>
        Effect.sync(() => {
          expect(token).toBe("access-token");
          expect(getAccessToken).toHaveBeenCalledWith({
            body: { accountId: "local-x-row", userId: USER_ID },
          });
        })
      )
    );
  });

  it.effect(
    "returns null without calling Better Auth when X is unlinked",
    () => {
      const findFirst = vi.fn(() => Promise.resolve(undefined));
      const getAccessToken = vi.fn(() =>
        Promise.resolve({ accessToken: "unexpected" })
      );

      return getAccessTokenEffect(USER_ID).pipe(
        Effect.provide(
          Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
        ),
        Effect.tap((token) =>
          Effect.sync(() => {
            expect(token).toBeNull();
            expect(getAccessToken).not.toHaveBeenCalled();
          })
        )
      );
    }
  );

  it.effect(
    "preserves warning-and-null behavior for account lookup failure",
    () => {
      const findFirst = vi.fn(() =>
        Promise.reject(new Error("D1 unavailable"))
      );
      const getAccessToken = vi.fn(() =>
        Promise.resolve({ accessToken: "unexpected" })
      );

      return getAccessTokenEffect(USER_ID).pipe(
        Effect.provide(
          Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
        ),
        Effect.tap((token) =>
          Effect.sync(() => {
            expect(token).toBeNull();
            expect(getAccessToken).not.toHaveBeenCalled();
          })
        )
      );
    }
  );
});
