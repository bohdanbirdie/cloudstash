import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { createAuth } from "../auth";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { sendSunsetNotification } from "../email/send-sunset-notification";
import { logSync } from "../logger";
import { type Env } from "../shared";

const logger = logSync("Admin");

export const handleSendSunsetNotification = async (
  request: Request,
  env: Env
): Promise<Response> => {
  const db = createDb(env.DB);
  const auth = createAuth(env, db);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    deadlineDate: string;
    dryRun?: boolean;
  };

  if (!body.deadlineDate) {
    return Response.json(
      { error: "deadlineDate is required" },
      { status: 400 }
    );
  }

  const users = await db.query.user.findMany({
    where: eq(schema.user.approved, true),
  });

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

  let sent = 0;
  let failed = 0;
  const errors: Array<{ email: string; error: unknown }> = [];

  for (const user of users) {
    try {
      await Effect.runPromise(
        sendSunsetNotification({
          email: user.email,
          name: user.name,
          apiKey: env.RESEND_API_KEY,
          deadlineDate: body.deadlineDate,
          appUrl: env.BETTER_AUTH_URL,
          emailFrom: env.EMAIL_FROM,
        })
      );
      sent++;
    } catch (error) {
      failed++;
      errors.push({ email: user.email, error });
      logger.error("Failed to send sunset notification", {
        email: user.email,
        error,
      });
    }
  }

  logger.info("Sunset notifications complete", { sent, failed });
  return Response.json({ sent, failed, total: users.length, errors });
};
