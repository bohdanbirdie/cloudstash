import { ApiKey, OrgId } from "@web/cf-worker/db/branded";
import { Schema } from "effect";

export { ApiKey, OrgId };

export const Creds = Schema.Struct({
  apiKey: ApiKey,
  orgId: OrgId,
});
export type Creds = typeof Creds.Type;

export const CredsPayload = Schema.Struct({
  apiKey: Schema.NullOr(ApiKey),
  orgId: Schema.NullOr(OrgId),
});
export type CredsPayload = typeof CredsPayload.Type;

const GetCredsMsg = Schema.Struct({
  type: Schema.Literal("cs:get-creds"),
});
export type GetCredsMsg = typeof GetCredsMsg.Type;

const CredsChangedMsg = Schema.Struct({
  type: Schema.Literal("cs:creds-changed"),
  creds: CredsPayload,
});
export type CredsChangedMsg = typeof CredsChangedMsg.Type;

const OpenConnectMsg = Schema.Struct({
  type: Schema.Literal("cs:open-connect"),
});
export type OpenConnectMsg = typeof OpenConnectMsg.Type;

export const ExtMessage = Schema.Union(
  GetCredsMsg,
  CredsChangedMsg,
  OpenConnectMsg
);
export type ExtMessage = typeof ExtMessage.Type;

export const decodeExtMessage = Schema.decodeUnknownEither(ExtMessage);

// Messages from the web app (externally_connectable) → background, used for the
// session handoff that replaces the manual pairing code.
const PingExtMsg = Schema.Struct({
  type: Schema.Literal("cs:ping"),
});

const ConnectExtMsg = Schema.Struct({
  type: Schema.Literal("cs:connect"),
  apiKey: ApiKey,
  orgId: OrgId,
});
export type ConnectExtMsg = typeof ConnectExtMsg.Type;

export const ExternalMessage = Schema.Union(PingExtMsg, ConnectExtMsg);
export type ExternalMessage = typeof ExternalMessage.Type;

export const decodeExternalMessage =
  Schema.decodeUnknownEither(ExternalMessage);
