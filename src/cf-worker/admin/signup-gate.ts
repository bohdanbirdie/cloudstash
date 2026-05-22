import { Effect, Schema } from "effect";

import { safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import { AppSettings } from "../settings/service";
import type { Env } from "../shared";

class InvalidBodyError extends Schema.TaggedError<InvalidBodyError>()(
  "InvalidBodyError",
  { cause: Schema.Defect }
) {}

const SetSignupGateBody = Schema.Struct({ enabled: Schema.Boolean });

const internalError = () =>
  Response.json({ error: "Internal server error" }, { status: 500 });

const badBody = () =>
  Response.json({ error: "Invalid request body" }, { status: 400 });

export const handleGetSignupGate = (
  _request: Request,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const settings = yield* AppSettings;
      const enabled = yield* settings.signupGateEnabled();
      yield* Effect.annotateCurrentSpan({ enabled });
      return Response.json({ enabled });
    }).pipe(
      Effect.withSpan("Admin.handleGetSignupGate"),
      Effect.catchTag("DbError", (cause) =>
        Effect.logError("getSignupGate DbError").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(internalError())
        )
      )
    )
  );

export const handleSetSignupGate = (
  request: Request,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const body = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: (cause) => new InvalidBodyError({ cause }),
      }).pipe(
        Effect.flatMap((raw) =>
          Schema.decodeUnknown(SetSignupGateBody)(raw).pipe(
            Effect.mapError((cause) => new InvalidBodyError({ cause }))
          )
        )
      );
      const settings = yield* AppSettings;
      yield* settings.setSignupGateEnabled(body.enabled);
      yield* Effect.annotateCurrentSpan({ enabled: body.enabled });
      return Response.json({ enabled: body.enabled });
    }).pipe(
      Effect.withSpan("Admin.handleSetSignupGate"),
      Effect.catchTags({
        InvalidBodyError: () => Effect.succeed(badBody()),
        DbError: (cause) =>
          Effect.logError("setSignupGate DbError").pipe(
            Effect.annotateLogs(safeErrorInfo(cause)),
            Effect.as(internalError())
          ),
      })
    )
  );
