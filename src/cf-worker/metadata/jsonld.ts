import { Match, Option } from "effect";

interface JsonLdNode {
  "@type"?: string | string[];
  "@graph"?: unknown[];
  headline?: string;
  name?: string;
  description?: string;
  image?: unknown;
  thumbnailUrl?: unknown;
}

const ARTICLE_TYPES = new Set([
  "Article",
  "BlogPosting",
  "NewsArticle",
  "Report",
  "ScholarlyArticle",
  "TechArticle",
  "VideoObject",
  "Recipe",
  "Product",
  "WebPage",
]);

function hasArticleType(type: string | string[] | undefined): boolean {
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => ARTICLE_TYPES.has(t));
}

function flatten(parsed: unknown): JsonLdNode[] {
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed.flatMap(flatten);
  if (typeof parsed !== "object") return [];
  const node = parsed as JsonLdNode;
  const nested = node["@graph"] ? flatten(node["@graph"]) : [];
  return [node, ...nested];
}

const pickString = (value: unknown): Option.Option<string> =>
  Match.value(value).pipe(
    Match.when(Match.string, (s) => Option.some(s)),
    Match.orElse(() => Option.none<string>())
  );

const pickImage = (value: unknown): Option.Option<string> =>
  Match.value(value).pipe(
    Match.when(Match.string, (s) => Option.some(s)),
    Match.when(
      (v: unknown): v is unknown[] => Array.isArray(v),
      (arr) => pickImage(arr[0])
    ),
    Match.when(Match.record, (obj) =>
      Option.firstSomeOf([pickString(obj.url), pickString(obj["@id"])])
    ),
    Match.orElse(() => Option.none<string>())
  );

export interface JsonLdMetadata {
  title?: string;
  description?: string;
  image?: string;
}

export function parseJsonLd(raw: string): JsonLdMetadata {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  const nodes = flatten(parsed);
  const article = nodes.find((n) => hasArticleType(n["@type"])) ?? nodes[0];
  if (!article) return {};

  const title = Option.firstSomeOf([
    pickString(article.headline),
    pickString(article.name),
  ]);
  const description = pickString(article.description);
  const image = Option.firstSomeOf([
    pickImage(article.image),
    pickImage(article.thumbnailUrl),
  ]);

  return {
    title: Option.getOrUndefined(title),
    description: Option.getOrUndefined(description),
    image: Option.getOrUndefined(image),
  };
}
