import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { createAuth } from "../auth";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { sendApprovalEmail } from "../email/send-approval-email";
import { logSync } from "../logger";
import { type Env } from "../shared";

const logger = logSync("Admin");

export const handleApproveUser = async (
  request: Request,
  userId: string,
  env: Env
): Promise<Response> => {
  const db = createDb(env.DB);
  const auth = createAuth(env, db);

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || (session.user as { role?: string }).role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  if (user.approved) {
    return Response.json({ success: true, alreadyApproved: true });
  }

  await db
    .update(schema.user)
    .set({ approved: true })
    .where(eq(schema.user.id, userId));

  await Effect.runPromise(
    sendApprovalEmail(user.email, user.name, env.RESEND_API_KEY)
  );

  logger.info("User approved by admin", { userId });
  return Response.json({ success: true });
};
