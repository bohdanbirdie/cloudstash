import { render } from "@react-email/render";
import { Effect } from "effect";
import { Resend } from "resend";

import { EmailSendError } from "./errors";
import { ApprovalEmail } from "./templates/approval-email";

export const sendApprovalEmail = (
  email: string,
  name: string | null,
  apiKey: string,
  emailFrom: string
) =>
  Effect.gen(function* () {
    const resend = new Resend(apiKey);

    const html = yield* Effect.promise(() => render(ApprovalEmail({ name })));
    const text = yield* Effect.promise(() =>
      render(ApprovalEmail({ name }), { plainText: true })
    );

    const result = yield* Effect.tryPromise({
      try: () =>
        resend.emails.send({
          from: emailFrom,
          to: email,
          subject: "Your CloudStash account has been approved!",
          html,
          text,
        }),
      catch: (cause) => new EmailSendError({ cause }),
    });

    if (result.error) {
      yield* Effect.logError("Resend API error");
      return yield* new EmailSendError({ cause: result.error });
    }

    yield* Effect.logInfo("Approval email sent").pipe(Effect.annotateLogs({ id: result.data?.id }));
  }).pipe(
    Effect.withSpan("Email.sendApprovalEmail"),
    Effect.tapError((e) =>
      Effect.logError("Failed to send approval email").pipe(
        Effect.annotateLogs({ error: String(e) })
      )
    ),
    Effect.catchAll(() => Effect.void)
  );
