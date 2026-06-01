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

const CredsChangedMsg = Schema.Struct({
  type: Schema.Literal("cs:creds-changed"),
  creds: CredsPayload,
});

const OpenConnectMsg = Schema.Struct({
  type: Schema.Literal("cs:open-connect"),
});

export const ExtMessage = Schema.Union(
  GetCredsMsg,
  CredsChangedMsg,
  OpenConnectMsg
);
export type ExtMessage = typeof ExtMessage.Type;

export const decodeExtMessage = Schema.decodeUnknownEither(ExtMessage);

const PingExtMsg = Schema.Struct({
  type: Schema.Literal("cs:ping"),
});

const ConnectExtMsg = Schema.Struct({
  type: Schema.Literal("cs:connect"),
  apiKey: ApiKey,
  orgId: OrgId,
});
export type ConnectExtMsg = typeof ConnectExtMsg.Type;

const ExternalMessage = Schema.Union(PingExtMsg, ConnectExtMsg);

export const decodeExternalMessage =
  Schema.decodeUnknownEither(ExternalMessage);
