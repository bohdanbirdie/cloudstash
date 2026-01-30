import { render } from "@react-email/render";
import { Effect } from "effect";
import { Resend } from "resend";

import { logSync } from "../logger";

import { ApprovalEmail } from "./templates/approval-email";

const logger = logSync("Email");

export const sendApprovalEmail = (
  email: string,
  name: string | null,
  apiKey: string
) =>
  Effect.gen(function* () {
    const resend = new Resend(apiKey);

    const html = yield* Effect.promise(() => render(ApprovalEmail({ name })));
    const text = yield* Effect.promise(() =>
      render(ApprovalEmail({ name }), { plainText: true })
    );

    yield* Effect.tryPromise({
      try: () =>
        resend.emails.send({
          from: "CloudStash <noreply@cloudstash.dev>",
          to: email,
          subject: "Your CloudStash account has been approved!",
          html,
          text,
        }),
      catch: (error) => {
        logger.error("Failed to send approval email", { error, email });
        return error;
      },
    });

    logger.info("Approval email sent", { email });
  }).pipe(Effect.catchAll(() => Effect.void));
