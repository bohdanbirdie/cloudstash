import { Cause, Context, Effect, Layer, Schema } from "effect";

import { APP_URL } from "../config";
import type { Creds } from "../messages";

const AccountBody = Schema.Struct({
  maxSavedLinks: Schema.Int,
  user: Schema.optional(
    Schema.Struct({
      name: Schema.NullOr(Schema.String),
      image: Schema.optional(Schema.NullOr(Schema.String)),
    })
  ),
});

export type ExtAccount = {
  readonly name: string | null;
  readonly image: string | null;
  readonly maxSavedLinks: number;
};

export type AccountResult =
  | { readonly tag: "ok"; readonly account: ExtAccount | null }
  | { readonly tag: "unauthorized" };

const ok = (account: ExtAccount | null): AccountResult => ({
  tag: "ok",
  account,
});

export class AccountClient extends Context.Service<
  AccountClient,
  {
    readonly get: (creds: Creds) => Effect.Effect<AccountResult>;
  }
>()("@ext/AccountClient") {
  static readonly layer = Layer.sync(AccountClient, () => {
    const get = (creds: Creds): Effect.Effect<AccountResult> =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() =>
          fetch(`${APP_URL}/api/connect/extension/account`, {
            headers: { authorization: `Bearer ${creds.apiKey}` },
          })
        );
        if (response.status === 401) {
          return { tag: "unauthorized" } as const;
        }
        if (!response.ok) {
          return ok(null);
        }
        const body = yield* Effect.tryPromise(
          () => response.json() as Promise<unknown>
        );
        const decoded = yield* Schema.decodeUnknownEffect(AccountBody)(body);
        return ok(
          decoded.user
            ? {
                name: decoded.user.name,
                image: decoded.user.image ?? null,
                maxSavedLinks: decoded.maxSavedLinks,
              }
            : null
        );
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logDebug("AccountClient.get failed; showing no header").pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) }),
            Effect.as(ok(null))
          )
        ),
        Effect.withSpan("AccountClient.get")
      );

    return AccountClient.of({ get });
  });
}
