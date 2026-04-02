import { render } from "@react-email/render";
import { Effect } from "effect";
import { Resend } from "resend";

import { logSync } from "../logger";
import { EmailSendError } from "./errors";
import { SunsetNotificationEmail } from "./templates/sunset-notification-email";

const logger = logSync("Email");

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
      catch: (cause) => {
        logger.error("Failed to send sunset notification", {
          error: cause,
          email: params.email,
        });
        return new EmailSendError({ cause });
      },
    });

    if (result.error) {
      logger.error("Resend API error", {
        email: params.email,
        error: result.error,
      });
      return yield* new EmailSendError({ cause: result.error });
    }

    logger.info("Sunset notification sent", {
      email: params.email,
      id: result.data?.id,
    });
  }
);
