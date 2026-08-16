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

export class BoundedFetchFailure extends Schema.TaggedErrorClass<BoundedFetchFailure>()(
  "BoundedFetchFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    reason: BoundedFetchReason,
    statusCode: Schema.optional(Schema.Number),
  }
) {}

const normalizeHostname = (hostname: string) =>
  hostname.toLowerCase().replace(/\.+$/, "");

const HttpUrl = Schema.Union([Schema.URLFromString, Schema.URL]).check(
  Schema.makeFilter(
    (url) =>
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      "Expected an HTTP(S) URL"
  )
);

const UrlWithoutCredentials = HttpUrl.check(
  Schema.makeFilter(
    (url) =>
      (url.username.length === 0 && url.password.length === 0) ||
      "Expected a URL without credentials"
  )
);

const PublicHostnameUrl = UrlWithoutCredentials.check(
  Schema.makeFilter((url) => {
    const hostname = normalizeHostname(url.hostname);
    const isIpLiteral =
      hostname.startsWith("[") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
    const isInternalName =
      !hostname.includes(".") ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".home.arpa");

    return (
      (hostname.length > 0 && !isIpLiteral && !isInternalName) ||
      "Expected a public hostname"
    );
  })
);

export const HttpTargetUrl = (ownHostname?: string) => {
  if (ownHostname === undefined) return PublicHostnameUrl;
  const normalizedOwnHostname = normalizeHostname(ownHostname);
  return PublicHostnameUrl.check(
    Schema.makeFilter(
      (url) =>
        normalizeHostname(url.hostname) !== normalizedOwnHostname ||
        "Expected a URL outside the application host"
    )
  );
};

const ContentLength = Schema.NumberFromString.check(
  Schema.isGreaterThanOrEqualTo(0)
);

const AcceptedContentType = (accepted: ReadonlyArray<string>) =>
  Schema.String.check(
    Schema.makeFilter((header) => {
      const mediaType = header.split(";", 1)[0]?.trim().toLowerCase();
      return (
        (mediaType !== undefined && accepted.includes(mediaType)) ||
        "Expected an accepted content type"
      );
    })
  );

type Fetcher = (
  input: URL,
  init: RequestInit & {
    readonly redirect: "manual";
    readonly signal: AbortSignal;
  }
) => Promise<Response>;

const failure = (
  reason: BoundedFetchReason,
  options: { readonly cause?: unknown; readonly statusCode?: number } = {}
) =>
  new BoundedFetchFailure({
    cause: options.cause,
    message: reason,
    reason,
    statusCode: options.statusCode,
  });

const cancelBody = (response: Response) =>
  response.body?.cancel().catch(() => undefined) ?? Promise.resolve();

const rejectResponse = async (
  response: Response,
  error: BoundedFetchFailure
): Promise<never> => {
  await cancelBody(response);
  throw error;
};

const fetchOnce = async (
  url: URL,
  options: {
    readonly fetcher: Fetcher;
    readonly headers?: HeadersInit;
    readonly signal: AbortSignal;
  }
) => {
  try {
    return await options.fetcher(url, {
      headers: options.headers,
      redirect: "manual",
      signal: options.signal,
    });
  } catch (cause) {
    throw failure(options.signal.aborted ? "timeout" : "unknown", { cause });
  }
};

const decodeTarget = async (
  target: unknown,
  targetSchema: ReturnType<typeof HttpTargetUrl>
) => {
  try {
    return await Schema.decodeUnknownPromise(targetSchema)(target);
  } catch (cause) {
    throw failure("target-rejected", { cause });
  }
};

const followRedirect = async (
  response: Response,
  current: URL,
  targetSchema: ReturnType<typeof HttpTargetUrl>
) => {
  await cancelBody(response);
  const location = response.headers.get("location");
  if (location === null) {
    throw failure("upstream-http-error", { statusCode: response.status });
  }
  const next = URL.parse(location, current);
  if (next === null) throw failure("target-rejected");
  return decodeTarget(next, targetSchema);
};

const validateResponse = async (
  response: Response,
  options: {
    readonly acceptedContentTypes: ReadonlyArray<string>;
    readonly maxBytes: number;
  }
) => {
  if (!response.ok) {
    return rejectResponse(
      response,
      failure("upstream-http-error", { statusCode: response.status })
    );
  }

  try {
    await Schema.decodeUnknownPromise(
      AcceptedContentType(options.acceptedContentTypes)
    )(response.headers.get("content-type"));
  } catch {
    return rejectResponse(response, failure("content-type-rejected"));
  }

  const contentLength = Option.fromNullishOr(
    response.headers.get("content-length")
  ).pipe(Option.flatMap(Schema.decodeUnknownOption(ContentLength)));
  if (Option.isSome(contentLength) && contentLength.value > options.maxBytes) {
    return rejectResponse(response, failure("body-too-large"));
  }
};

const readCappedText = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal
) => {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  if (signal.aborted) {
    await reader.cancel().catch(() => undefined);
    throw failure("timeout", { cause: signal.reason });
  }

  const bytes = new Uint8Array(maxBytes);
  let length = 0;
  let rejectAbort: (error: BoundedFetchFailure) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () =>
    rejectAbort(failure("timeout", { cause: signal.reason }));
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) return new TextDecoder().decode(bytes.subarray(0, length));
      if (value.byteLength > maxBytes - length) {
        throw failure("body-too-large");
      }
      bytes.set(value, length);
      length += value.byteLength;
    }
  } catch (cause) {
    await reader.cancel().catch(() => undefined);
    if (cause instanceof BoundedFetchFailure) throw cause;
    throw failure(signal.aborted ? "timeout" : "unknown", { cause });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
};

export const fetchBoundedText = async (options: {
  readonly acceptedContentTypes: ReadonlyArray<string>;
  readonly fetcher?: Fetcher;
  readonly headers?: HeadersInit;
  readonly maxBytes: number;
  readonly maxRedirects: number;
  readonly signal: AbortSignal;
  readonly targetSchema: ReturnType<typeof HttpTargetUrl>;
  readonly url: unknown;
}) => {
  const fetcher = options.fetcher ?? fetch;
  let current = await decodeTarget(options.url, options.targetSchema);

  for (let hop = 0; hop <= options.maxRedirects; hop++) {
    const response = await fetchOnce(current, {
      fetcher,
      headers: options.headers,
      signal: options.signal,
    });
    const isRedirect = response.status >= 300 && response.status < 400;

    if (!isRedirect) {
      await validateResponse(response, options);
      return {
        body: await readCappedText(response, options.maxBytes, options.signal),
        finalUrl: current,
      };
    }

    if (hop === options.maxRedirects) {
      return rejectResponse(response, failure("too-many-redirects"));
    }
    current = await followRedirect(response, current, options.targetSchema);
  }

  throw failure("too-many-redirects");
};
