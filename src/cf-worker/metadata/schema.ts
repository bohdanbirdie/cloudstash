import { Option, Schema } from 'effect'

export const ResolvedUrl = (baseUrl: string) =>
  Schema.transform(Schema.String, Schema.String, {
    decode: (url) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url
      }
      if (url.startsWith('//')) {
        return `https:${url}`
      }
      return Option.fromNullable(URL.parse(url, baseUrl)?.href).pipe(Option.getOrElse(() => url))
    },
    encode: (url) => url,
  })

export class OgMetadata extends Schema.Class<OgMetadata>('OgMetadata')({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  image: Schema.optional(Schema.String),
  favicon: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
}) {}
