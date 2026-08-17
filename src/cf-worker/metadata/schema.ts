import { Option, Schema, SchemaTransformation } from "effect";

export const HttpUrlString = Schema.String.check(
  Schema.makeFilter((value) => {
    const url = URL.parse(value);
    return url && (url.protocol === "http:" || url.protocol === "https:")
      ? undefined
      : "Expected an HTTP(S) URL";
  })
);

export const ResolvedUrl = (baseUrl: string) =>
  Schema.String.pipe(
    Schema.decodeTo(
      HttpUrlString,
      SchemaTransformation.transform({
        decode: (url) => {
          if (url.startsWith("http://") || url.startsWith("https://")) {
            return url;
          }
          if (url.startsWith("//")) {
            return `https:${url}`;
          }
          return Option.fromNullishOr(URL.parse(url, baseUrl)?.href).pipe(
            Option.getOrElse(() => url)
          );
        },
        encode: (url) => url,
      })
    )
  );

export class OgMetadata extends Schema.Class<OgMetadata>("OgMetadata")({
  description: Schema.optional(Schema.String),
  favicon: Schema.optional(HttpUrlString),
  image: Schema.optional(HttpUrlString),
  title: Schema.optional(Schema.String),
}) {}
