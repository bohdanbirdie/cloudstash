import { Schema } from "effect";

/**
 * Why an account was parked in `needs_reconnect`.
 *
 * `auth` — the OAuth token was rejected (401). Reconnecting fixes it, and
 * reconcile can clear the park itself by re-checking `getMe`.
 *
 * `access_level` — the provider refused the bookmarks endpoint (402) while the
 * token stayed valid. `getMe` still succeeds, so it cannot observe this
 * condition; auto-recovery would return the account to `active` only for the
 * next poll to fail identically. Only an explicit resume clears it.
 */
export const XSyncReconnectReason = Schema.Literals(["auth", "access_level"]);
export type XSyncReconnectReason = typeof XSyncReconnectReason.Type;

/**
 * Accounts parked before the reason was recorded decode to `auth`, which keeps
 * their existing auto-recovery behaviour.
 */
export const defaultReconnectReason: XSyncReconnectReason = "auth";
