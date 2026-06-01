import { Schema } from "effect";

export class StorageError extends Schema.TaggedError<StorageError>()(
  "StorageError",
  {
    op: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class StorageUnsupportedError extends Schema.TaggedError<StorageUnsupportedError>()(
  "StorageUnsupportedError",
  { op: Schema.String }
) {}

export class MessengerError extends Schema.TaggedError<MessengerError>()(
  "MessengerError",
  { cause: Schema.Defect }
) {}

export class OffscreenError extends Schema.TaggedError<OffscreenError>()(
  "OffscreenError",
  { cause: Schema.Defect }
) {}

export class TabsError extends Schema.TaggedError<TabsError>()("TabsError", {
  cause: Schema.Defect,
}) {}

export class ConnectNetworkError extends Schema.TaggedError<ConnectNetworkError>()(
  "ConnectNetworkError",
  { cause: Schema.Defect }
) {}

export class ConnectServerError extends Schema.TaggedError<ConnectServerError>()(
  "ConnectServerError",
  {
    status: Schema.Number,
    message: Schema.String,
  }
) {}

export class InvalidResponseError extends Schema.TaggedError<InvalidResponseError>()(
  "InvalidResponseError",
  { cause: Schema.Defect }
) {}

export class InvalidUrlError extends Schema.TaggedError<InvalidUrlError>()(
  "InvalidUrlError",
  { input: Schema.String }
) {}

export class LivestoreBootError extends Schema.TaggedError<LivestoreBootError>()(
  "LivestoreBootError",
  { cause: Schema.Defect }
) {}

export class LivestoreShutdownError extends Schema.TaggedError<LivestoreShutdownError>()(
  "LivestoreShutdownError",
  { cause: Schema.Defect }
) {}
