import { Option, Schema } from "effect";

import { ApiKey } from "../db/branded";

const BearerAuthorization = Schema.String.check(
  Schema.isPattern(/^Bearer\s+\S+$/i)
);
const decodeBearerAuthorization =
  Schema.decodeUnknownOption(BearerAuthorization);

export const bearerApiKey = (headers: Headers): Option.Option<ApiKey> =>
  Option.map(
    decodeBearerAuthorization(headers.get("authorization")),
    (authorization) => ApiKey.make(authorization.replace(/^Bearer\s+/i, ""))
  );
