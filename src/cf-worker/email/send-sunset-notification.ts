import { render } from "@react-email/render";
import { Effect } from "effect";
import { Resend } from "resend";

import { logSync } from "../logger";
import { SunsetNotificationEmail } from "./templates/sunset-notification-email";

const logger = logSync("Email");

export const sendSunsetNotification = (params: {
  email: string;
  name: string | null;
  apiKey: string;
  deadlineDate: string;
  appUrl: string;
  emailFrom: string;
}) =>
  Effect.gen(function* () {
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
      catch: (error) => {
        logger.error("Failed to send sunset notification", {
          error,
          email: params.email,
        });
        return error;
      },
    });

    if (result.error) {
      logger.error("Resend API error", {
        email: params.email,
        error: result.error,
      });
      return yield* Effect.fail(result.error);
    }

    logger.info("Sunset notification sent", {
      email: params.email,
      id: result.data?.id,
    });
  });
