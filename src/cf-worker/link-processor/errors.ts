import { Schema } from 'effect'

export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()('InvalidUrlError', {
  url: Schema.String,
}) {}
