import { Cause, Context, Effect, Layer, Schema } from "effect";

import { APP_URL } from "../config";
import type { Creds } from "../messages";

// The 200 body from the worker's `/account` endpoint: the connected user's
// display name and avatar URL (no email). Avatar URLs are the user's own Google
// account image; the popup loads them with referrerPolicy="no-referrer".
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

/**
 * Fetches the connected user's display name and avatar for the popup header.
 * Purely cosmetic — there is no paywall. It FAILS OPEN: any non-200/network
 * error resolves to `null`, so the header simply shows nothing.
 */
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
        const decoded = yield* Schema.decodeUnknown(AccountBody)(body).pipe(
          Effect.orElseSucceed(() => ({ user: undefined }))
        );
        return decoded.user
          ? { name: decoded.user.name, image: decoded.user.image ?? null }
          : null;
      }).pipe(
        // Fail open (header is cosmetic) but keep failures observable — a defect
        // here means a real bug, not just an offline header.
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
