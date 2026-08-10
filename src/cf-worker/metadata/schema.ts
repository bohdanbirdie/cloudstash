import { Option, Schema, SchemaTransformation } from "effect";

export const ResolvedUrl = (baseUrl: string) =>
  Schema.String.pipe(
    Schema.decodeTo(
      Schema.String,
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
  favicon: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
}) {}
