import { Cause, Context, Effect, Layer, Schema } from "effect";

import { APP_URL } from "../config";
import type { Creds } from "../messages";

const AccountBody = Schema.Struct({
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
};

export class AccountClient extends Context.Tag("@ext/AccountClient")<
  AccountClient,
  {
    readonly get: (creds: Creds) => Effect.Effect<ExtAccount | null>;
  }
>() {
  static readonly layer = Layer.sync(AccountClient, () => {
    const get = (creds: Creds): Effect.Effect<ExtAccount | null> =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() =>
          fetch(`${APP_URL}/api/connect/extension/account`, {
            headers: { authorization: `Bearer ${creds.apiKey}` },
          })
        );
        if (!response.ok) {
          return null;
        }
        const body = yield* Effect.tryPromise(
          () => response.json() as Promise<unknown>
        );
        const decoded = yield* Schema.decodeUnknown(AccountBody)(body);
        return decoded.user
          ? { name: decoded.user.name, image: decoded.user.image ?? null }
          : null;
      }).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logDebug("AccountClient.get failed; showing no header").pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) }),
            Effect.as(null)
          )
        ),
        Effect.withSpan("AccountClient.get")
      );

    return AccountClient.of({ get });
  });
}
