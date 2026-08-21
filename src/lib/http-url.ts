import { Option, Schema } from "effect";

export const HttpUrlFromString = Schema.URLFromString.pipe(
  Schema.annotateEncoded({ format: "uri" }),
  Schema.check(
    Schema.makeFilter(
      (url) =>
        url.protocol === "http:" ||
        url.protocol === "https:" ||
        "Expected an HTTP(S) URL"
    )
  )
);

const decodeHttpUrl = Schema.decodeUnknownOption(HttpUrlFromString);

export const parseHttpUrl = (input: string): URL | null => {
  const parsed = decodeHttpUrl(input);
  return Option.isSome(parsed) ? parsed.value : null;
};
