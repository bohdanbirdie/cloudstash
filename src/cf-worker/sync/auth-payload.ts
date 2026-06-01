import { Schema } from "effect";

import { ApiKey, OrgId } from "../db/branded";

export const ExtensionPayload = Schema.Struct({ apiKey: ApiKey });
export const decodeExtensionPayload =
  Schema.decodeUnknownOption(ExtensionPayload);

export const ApiKeyMetadata = Schema.Struct({ orgId: OrgId });
export const decodeApiKeyMetadata = Schema.decodeUnknownOption(ApiKeyMetadata);
