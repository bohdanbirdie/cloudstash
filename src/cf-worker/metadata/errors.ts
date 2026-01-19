import { Schema } from 'effect'

export class MetadataFetchError extends Schema.TaggedError<MetadataFetchError>()(
  'MetadataFetchError',
  {
    url: Schema.String,
    statusCode: Schema.Number,
  },
) {}

export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
  'MetadataParseError',
  {
    url: Schema.String,
    error: Schema.Defect,
  },
) {}

export class MissingUrlError extends Schema.TaggedError<MissingUrlError>()('MissingUrlError', {}) {}

export type MetadataError = MetadataFetchError | MetadataParseError | MissingUrlError
