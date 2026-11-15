import { Schema } from "effect";

export class EmailSendError extends Schema.TaggedError<EmailSendError>()(
  "EmailSendError",
  {
    cause: Schema.Unknown,
  }
) {}
