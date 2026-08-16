import { Option, Schema } from "effect";

export const BoundedFetchReason = Schema.Literals([
  "target-rejected",
  "too-many-redirects",
  "body-too-large",
  "content-type-rejected",
  "timeout",
  "upstream-http-error",
  "unknown",
]);
export type BoundedFetchReason = typeof BoundedFetchReason.Type;

export class BoundedFetchFailure extends Error {
  override readonly name = "BoundedFetchFailure";

  constructor(
    readonly reason: BoundedFetchReason,
    readonly statusCode?: number,
    options?: ErrorOptions
  ) {
    super(reason, options);
  }
}

export const HttpTargetUrl = (ownHostname?: string) =>
  Schema.URLFromString.check(
    Schema.makeFilter((url) => {
      const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
      const isHttp = url.protocol === "http:" || url.protocol === "https:";
      const hasCredentials = url.username.length > 0 || url.password.length > 0;
      const isIpLiteral =
        hostname.startsWith("[") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      const isInternalName =
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        hostname.endsWith(".internal") ||
        hostname.endsWith(".home.arpa");
      const isOwnHost =
        ownHostname !== undefined &&
        hostname === ownHostname.toLowerCase().replace(/\.+$/, "");

      return isHttp &&
        !hasCredentials &&
        hostname.length > 0 &&
        !isIpLiteral &&
        !isInternalName &&
        !isOwnHost
        ? undefined
        : "Expected a public HTTP(S) URL";
    })
  );

const ContentLength = Schema.NumberFromString.check(
  Schema.isGreaterThanOrEqualTo(0)
);

const cancelBody = (response: Response) =>
  response.body?.cancel().catch(() => undefined) ?? Promise.resolve();

const readBodyCapped = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal
) => {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BoundedFetchFailure("body-too-large");
      }
      chunks.push(value);
    }
  } catch (cause) {
    if (cause instanceof BoundedFetchFailure) throw cause;
    throw new BoundedFetchFailure(
      signal.aborted ? "timeout" : "unknown",
      undefined,
      {
        cause,
      }
    );
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
};

export const fetchBoundedText = async (options: {
  readonly acceptedContentTypes: ReadonlyArray<string>;
  readonly fetcher?: typeof fetch;
  readonly headers?: HeadersInit;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly signal: AbortSignal;
  readonly targetSchema: ReturnType<typeof HttpTargetUrl>;
  readonly url: URL;
}) => {
  const fetcher = options.fetcher ?? fetch;
  const decodeTarget = Schema.decodeUnknownPromise(options.targetSchema);
  let current = options.url;

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    let response: Response;
    try {
      response = await fetcher(current, {
        headers: options.headers,
        redirect: "manual",
        signal: options.signal,
      });
    } catch (cause) {
      throw new BoundedFetchFailure(
        options.signal.aborted ? "timeout" : "unknown",
        undefined,
        { cause }
      );
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        await cancelBody(response);
        throw new BoundedFetchFailure("upstream-http-error", response.status);
      }
      await cancelBody(response);
      if (hop === options.maxRedirects) {
        throw new BoundedFetchFailure("too-many-redirects");
      }
      const next = URL.parse(location, current);
      if (!next) throw new BoundedFetchFailure("target-rejected");
      try {
        current = await decodeTarget(next.href);
      } catch (cause) {
        throw new BoundedFetchFailure("target-rejected", undefined, { cause });
      }
      continue;
    }

    if (!response.ok) {
      await cancelBody(response);
      throw new BoundedFetchFailure("upstream-http-error", response.status);
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !options.acceptedContentTypes.includes(contentType)) {
      await cancelBody(response);
      throw new BoundedFetchFailure("content-type-rejected");
    }

    const contentLength = Option.fromNullishOr(
      response.headers.get("content-length")
    ).pipe(Option.flatMap(Schema.decodeUnknownOption(ContentLength)));
    if (
      Option.isSome(contentLength) &&
      contentLength.value > options.maxBytes
    ) {
      await cancelBody(response);
      throw new BoundedFetchFailure("body-too-large");
    }

    return {
      body: await readBodyCapped(response, options.maxBytes, options.signal),
      finalUrl: current,
    };
  }

  throw new BoundedFetchFailure("too-many-redirects");
};
