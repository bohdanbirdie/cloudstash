import { Schema } from "effect";

export const XSyncStatus = Schema.Literals([
  "active",
  "needs_reconnect",
  "paused",
  "suspended",
  "disconnected",
]);
export type XSyncStatus = typeof XSyncStatus.Type;

export const XStatusResponse = Schema.Struct({
  connected: Schema.Boolean,
  xUsername: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(XSyncStatus),
  syncEnabled: Schema.optionalKey(Schema.Boolean),
  lastSyncedAt: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
export type XStatusResponse = typeof XStatusResponse.Type;
