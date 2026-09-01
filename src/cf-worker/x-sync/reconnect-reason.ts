import { Schema } from "effect";

// `getMe` reports 401 but never 402 — only `getBookmarks` does — so reconcile
// can verify an `auth` park but not an `access_level` one.
export const XSyncReconnectReason = Schema.Literals(["auth", "access_level"]);
export type XSyncReconnectReason = typeof XSyncReconnectReason.Type;

export const defaultReconnectReason: XSyncReconnectReason = "auth";
