import { Effect } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { sendApprovalEmail } from "../email/send-approval-email";
import type { Env } from "../shared";

export const handleApproveUser = async (
  request: Request,
  userId: string,
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

      const user = yield* auth.findUser(userId);

      if (!user) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      if (user.approved) {
        return Response.json({ success: true, alreadyApproved: true });
      }

      yield* auth.approveUser(userId);

      yield* sendApprovalEmail(
        user.email,
        user.name,
        env.RESEND_API_KEY,
        env.EMAIL_FROM
      );

      yield* Effect.logInfo("User approved by admin").pipe(Effect.annotateLogs({ userId }));
      return Response.json({ success: true });
    }).pipe(
      Effect.withSpan("Admin.handleApproveUser"),
      Effect.provide(AppLayerLive(env)),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
