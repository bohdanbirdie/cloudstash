import { Effect, Option, Schema } from "effect";

import { AuthClient } from "../auth/service";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import { WeeklyDigestRpcResult } from "../weekly-digest/rpc";

class DigestRpcError extends Schema.TaggedError<DigestRpcError>()(
  "DigestRpcError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

class DigestRpcDecodeError extends Schema.TaggedError<DigestRpcDecodeError>()(
  "DigestRpcDecodeError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

class TriggerDigestUnauthorized extends Schema.TaggedError<TriggerDigestUnauthorized>()(
  "TriggerDigestUnauthorized",
  {}
) {}

class TriggerDigestMissingOrg extends Schema.TaggedError<TriggerDigestMissingOrg>()(
  "TriggerDigestMissingOrg",
  {}
) {}

const decodeRpcResult = Schema.decodeUnknown(WeeklyDigestRpcResult);

export const handleTriggerDigest = (
  request: Request,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const auth = yield* AuthClient;

      const session = yield* Effect.promise(() =>
        auth.api.getSession({ headers: request.headers })
      );
      if (!session) {
        return yield* new TriggerDigestUnauthorized();
      }

      const activeOrgId = yield* Option.fromNullable(
        session.session?.activeOrganizationId
      ).pipe(
        Option.match({
          onNone: () => Effect.fail(new TriggerDigestMissingOrg()),
          onSome: Effect.succeed,
        })
      );

      const storeId = OrgId.make(activeOrgId);
      const stub = env.LINK_PROCESSOR_DO.get(
        env.LINK_PROCESSOR_DO.idFromName(storeId)
      );
      const callRpc = async (): Promise<unknown> => stub.triggerDigest(storeId);
      const raw = yield* Effect.tryPromise({
        catch: (cause) =>
          new DigestRpcError({
            cause,
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        try: callRpc,
      });
      const result = yield* decodeRpcResult(raw).pipe(
        Effect.catchTag(
          "ParseError",
          (e) =>
            new DigestRpcDecodeError({
              cause: e,
              message: e.message,
            })
        )
      );

      yield* Effect.logInfo("Admin triggered weekly digest").pipe(
        Effect.annotateLogs({
          status: result.status,
          storeId: maskId(storeId),
          userId: session.user.id,
        })
      );

      return Response.json(result);
    }).pipe(
      Effect.withSpan("Admin.handleTriggerDigest"),
      Effect.catchTags({
        DigestRpcDecodeError: (e) =>
          Effect.logError("Digest RPC result failed to decode").pipe(
            Effect.annotateLogs({ message: e.message }),
            Effect.as(
              Response.json(
                { error: "Digest RPC returned unexpected shape" },
                { status: 502 }
              )
            )
          ),
        DigestRpcError: (e) =>
          Effect.logError("Digest RPC failed").pipe(
            Effect.annotateLogs({ message: e.message }),
            Effect.as(
              Response.json(
                { error: "Digest RPC failed", message: e.message },
                { status: 502 }
              )
            )
          ),
        TriggerDigestMissingOrg: () =>
          Effect.succeed(
            Response.json({ error: "No active organization" }, { status: 400 })
          ),
        TriggerDigestUnauthorized: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
      })
    )
  );
