import { Schema } from "effect";

export class EmailSendError extends Schema.TaggedErrorClass<EmailSendError>()(
  "EmailSendError",
  {
    cause: Schema.Unknown,
  }
) {}
