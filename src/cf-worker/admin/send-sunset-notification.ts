import { Array as Arr, Effect, Either } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { sendSunsetNotification } from "../email/send-sunset-notification";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("Admin");

export const handleSendSunsetNotification = async (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const auth = yield* AuthClient;

      const session = yield* Effect.promise(() =>
        auth.api.getSession({ headers: request.headers })
      );
      if (!session || (session.user as { role?: string }).role !== "admin") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const body: { deadlineDate: string; dryRun?: boolean } =
        yield* Effect.promise(
          (): Promise<{ deadlineDate: string; dryRun?: boolean }> =>
            request.json()
        );

      if (!body.deadlineDate) {
        return Response.json(
          { error: "deadlineDate is required" },
          { status: 400 }
        );
      }

      const users = yield* auth.listApprovedUsers();

      if (body.dryRun) {
        logger.info("Dry run: would send sunset notification", {
          userCount: users.length,
          emails: users.map((u) => u.email),
        });
        return Response.json({
          dryRun: true,
          userCount: users.length,
          emails: users.map((u) => u.email),
        });
      }

      const results = yield* Effect.forEach(
        users,
        (user) =>
          sendSunsetNotification({
            email: user.email,
            name: user.name,
            apiKey: env.RESEND_API_KEY,
            deadlineDate: body.deadlineDate,
            appUrl: env.BETTER_AUTH_URL,
            emailFrom: env.EMAIL_FROM,
          }).pipe(
            Effect.as(Either.right(user.email)),
            Effect.catchAll((error) => {
              logger.error("Failed to send sunset notification", {
                email: user.email,
                error,
              });
              return Effect.succeed(Either.left({ email: user.email, error }));
            })
          ),
        { concurrency: 5 }
      );

      const [errors, successes] = Arr.partitionMap(results, (r) => r);
      const sent = successes.length;
      const failed = errors.length;

      logger.info("Sunset notifications complete", { sent, failed });
      return Response.json({ sent, failed, total: users.length, errors });
    }).pipe(
      Effect.withSpan("Admin.handleSendSunsetNotification"),
      Effect.provide(AppLayerLive(env)),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
