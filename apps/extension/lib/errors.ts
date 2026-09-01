import { Schema } from "effect";

export class StorageError extends Schema.TaggedErrorClass<StorageError>()(
  "StorageError",
  {
    op: Schema.String,
    cause: Schema.Defect(),
  }
) {}

export class StorageUnsupportedError extends Schema.TaggedErrorClass<StorageUnsupportedError>()(
  "StorageUnsupportedError",
  { op: Schema.String }
) {}

export class MessengerError extends Schema.TaggedErrorClass<MessengerError>()(
  "MessengerError",
  { cause: Schema.Defect() }
) {}

export class OffscreenError extends Schema.TaggedErrorClass<OffscreenError>()(
  "OffscreenError",
  { cause: Schema.Defect() }
) {}

export class TabsError extends Schema.TaggedErrorClass<TabsError>()(
  "TabsError",
  {
    cause: Schema.Defect(),
  }
) {}

export class ConnectNetworkError extends Schema.TaggedErrorClass<ConnectNetworkError>()(
  "ConnectNetworkError",
  { cause: Schema.Defect() }
) {}

export class ConnectServerError extends Schema.TaggedErrorClass<ConnectServerError>()(
  "ConnectServerError",
  {
    status: Schema.Number,
    message: Schema.String,
  }
) {}

export class InvalidResponseError extends Schema.TaggedErrorClass<InvalidResponseError>()(
  "InvalidResponseError",
  { cause: Schema.Defect() }
) {}

export class InvalidUrlError extends Schema.TaggedErrorClass<InvalidUrlError>()(
  "InvalidUrlError",
  { input: Schema.String }
) {}

export class LivestoreBootError extends Schema.TaggedErrorClass<LivestoreBootError>()(
  "LivestoreBootError",
  { cause: Schema.Defect() }
) {}

export class LivestoreShutdownError extends Schema.TaggedErrorClass<LivestoreShutdownError>()(
  "LivestoreShutdownError",
  { cause: Schema.Defect() }
) {}
