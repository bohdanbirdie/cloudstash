import { Effect, Layer, Option } from "effect";

import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../../auth/workspace-access";
import { Billing, requireCapability } from "../../billing/service";
import { ApiKey } from "../../db/branded";
import type { Env } from "../../shared";
import {
  TelegramInvalidApiKeyError,
  TelegramAuthUnavailableError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "../errors";
import { telegramKvOrDie } from "../kv";
import { SourceAuth } from "../services";

const verifyApiKey = Effect.fn("Telegram.verifyApiKey")(function* (
  workspaceAccess: WorkspaceAccess["Service"],
  billing: Billing["Service"],
  apiKey: string
) {
  const authorization = yield* workspaceAccess
    .authorizeApiKey(ApiKey.make(apiKey))
    .pipe(
      Effect.mapError((error) =>
        matchWorkspaceAccessError<
          | TelegramInvalidApiKeyError
          | TelegramMissingOrgIdError
          | RateLimitError
          | TelegramAuthUnavailableError
        >(error, {
          unauthorized: () => new TelegramInvalidApiKeyError({}),
          missingScope: () => new TelegramMissingOrgIdError({}),
          forbidden: () => new TelegramInvalidApiKeyError({}),
          backend: (backend) =>
            backend.operation === "verifyApiKey" &&
            String(backend.cause).includes("Rate limit")
              ? new RateLimitError({})
              : new TelegramAuthUnavailableError({
                  cause: backend.cause,
                  operation: backend.operation,
                }),
        })
      )
    );

  yield* requireCapability(authorization.orgId, "integrations").pipe(
    Effect.provideService(Billing, billing),
    Effect.catchTags({
      DbError: (error) =>
        Effect.fail(
          new TelegramAuthUnavailableError({
            cause: error,
            operation: "lookupCapabilities",
          })
        ),
      OrgNotFoundError: (error) =>
        Effect.fail(
          new TelegramAuthUnavailableError({
            cause: error,
            operation: "lookupCapabilities",
          })
        ),
    })
  );

  return authorization;
});

export interface TelegramSourceAuthDeps {
  readonly billing: Billing["Service"];
  readonly readKey: Effect.Effect<Option.Option<ApiKey>>;
  readonly workspaceAccess: WorkspaceAccess["Service"];
}

export const makeTelegramSourceAuth = ({
  billing,
  readKey,
  workspaceAccess,
}: TelegramSourceAuthDeps): SourceAuth["Service"] =>
  SourceAuth.of({
    authenticate: Effect.fnUntraced(function* () {
      const apiKey = yield* readKey.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new NotConnectedError({})),
            onSome: Effect.succeed,
          })
        )
      );
      return yield* verifyApiKey(workspaceAccess, billing, apiKey);
    }),
    verify: Effect.fnUntraced(function* (apiKey) {
      return yield* verifyApiKey(workspaceAccess, billing, apiKey);
    }),
  });

export const TelegramSourceAuthLive = (env: Env, chatId: number) =>
  Layer.effect(
    SourceAuth,
    Effect.gen(function* () {
      const workspaceAccess = yield* WorkspaceAccess;
      const billing = yield* Billing;
      return makeTelegramSourceAuth({
        billing,
        readKey: telegramKvOrDie(() =>
          env.TELEGRAM_KV.get(`telegram:${chatId}`)
        ).pipe(
          Effect.map(Option.fromNullishOr),
          Effect.map(Option.map((key) => ApiKey.make(key)))
        ),
        workspaceAccess,
      });
    })
  );
