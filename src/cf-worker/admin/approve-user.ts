import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import * as schema from "../db/schema";
import { DbClient } from "../db/service";
import { sendApprovalEmail } from "../email/send-approval-email";
import { logSync } from "../logger";
import type { Env } from "../shared";

const logger = logSync("Admin");

export const handleApproveUser = async (
  request: Request,
  userId: string,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* DbClient;
      const auth = yield* AuthClient;

      const session = yield* Effect.promise(() =>
        auth.api.getSession({ headers: request.headers })
      );
      if (!session || (session.user as { role?: string }).role !== "admin") {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const user = yield* Effect.promise(() =>
        db.query.user.findFirst({
          where: eq(schema.user.id, userId),
        })
      );

      if (!user) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }

      if (user.approved) {
        return Response.json({ success: true, alreadyApproved: true });
      }

      yield* Effect.promise(() =>
        db
          .update(schema.user)
          .set({ approved: true })
          .where(eq(schema.user.id, userId))
      );

      yield* sendApprovalEmail(
        user.email,
        user.name,
        env.RESEND_API_KEY,
        env.EMAIL_FROM
      );

      logger.info("User approved by admin", { userId });
      return Response.json({ success: true });
    }).pipe(Effect.provide(AppLayerLive(env)))
  );
