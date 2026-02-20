import { Context, Layer } from "effect";

import { type RequestContextData } from "./types";

export class RequestContext extends Context.Tag("RequestContext")<
  RequestContext,
  RequestContextData
>() {}

export const createRequestContext = (): RequestContextData => {
  const fields: Record<string, unknown> = {};
  return {
    requestId: crypto.randomUUID(),
    startTime: Date.now(),
    addField: (key: string, value: unknown) => {
      fields[key] = value;
    },
    addFields: (newFields: Record<string, unknown>) => {
      Object.assign(fields, newFields);
    },
    getFields: () => ({ ...fields }),
  };
};

export const makeRequestContextLayer = (ctx: RequestContextData) =>
  Layer.succeed(RequestContext, ctx);
