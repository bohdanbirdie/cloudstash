import { render } from "@react-email/render";
import { Effect } from "effect";
import { Resend } from "resend";

import { EmailSendError } from "./errors";
import { SunsetNotificationEmail } from "./templates/sunset-notification-email";

export const sendSunsetNotification = Effect.fn("Email.sendSunsetNotification")(
  function* (params: {
    email: string;
    name: string | null;
    apiKey: string;
    deadlineDate: string;
    appUrl: string;
    emailFrom: string;
  }) {
    const resend = new Resend(params.apiKey);

    const templateProps = {
      name: params.name,
      deadlineDate: params.deadlineDate,
      appUrl: params.appUrl,
    };

    const html = yield* Effect.promise(() =>
      render(SunsetNotificationEmail(templateProps))
    );
    const text = yield* Effect.promise(() =>
      render(SunsetNotificationEmail(templateProps), { plainText: true })
    );

    const result = yield* Effect.tryPromise({
      try: () =>
        resend.emails.send({
          from: params.emailFrom,
          to: params.email,
          subject: "CloudStash is going open-source!",
          html,
          text,
        }),
      catch: (cause) => new EmailSendError({ cause }),
    });

    if (result.error) {
      yield* Effect.logError("Resend API error");
      return yield* new EmailSendError({ cause: result.error });
    }

    yield* Effect.logInfo("Sunset notification sent").pipe(
      Effect.annotateLogs({ id: result.data?.id })
    );
  }
);
