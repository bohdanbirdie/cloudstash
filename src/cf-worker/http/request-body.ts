import { Effect, Schema } from "effect";

export class RequestBodyTooLargeError extends Schema.TaggedErrorClass<RequestBodyTooLargeError>()(
  "RequestBodyTooLargeError",
  { maxBytes: Schema.Int }
) {}

export class RequestBodyReadError extends Schema.TaggedErrorClass<RequestBodyReadError>()(
  "RequestBodyReadError",
  { cause: Schema.Defect() }
) {}

export const readRequestBody = Effect.fn("HTTP.readRequestBody")(function* (
  request: Request,
  maxBytes: number
) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return yield* new RequestBodyTooLargeError({ maxBytes });
  }

  return yield* Effect.tryPromise({
    try: async () => {
      const reader = request.clone().body?.getReader();
      if (!reader) return "";

      const decoder = new TextDecoder();
      let body = "";
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new RequestBodyTooLargeError({ maxBytes });
        }
        body += decoder.decode(value, { stream: true });
      }
      return body + decoder.decode();
    },
    catch: (cause) =>
      cause instanceof RequestBodyTooLargeError
        ? cause
        : new RequestBodyReadError({ cause }),
  });
});
