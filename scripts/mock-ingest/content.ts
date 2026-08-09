/**
 * Deterministic, unique-per-id realistic HTML pages for the mock content server.
 * Content is derived purely from the id string (FNV-1a hash + mulberry32 PRNG),
 * so the same id always renders the same page — no shared mutable state needed.
 */

const ADJECTIVES = [
  "quiet",
  "durable",
  "distributed",
  "ephemeral",
  "resilient",
  "lazy",
  "eager",
  "immutable",
  "concurrent",
  "idempotent",
  "minimal",
  "ambient",
  "stateful",
  "stateless",
  "observable",
  "deterministic",
  "elastic",
  "compact",
  "hidden",
  "graceful",
];

const NOUNS = [
  "cache",
  "queue",
  "ledger",
  "stream",
  "snapshot",
  "boundary",
  "protocol",
  "object",
  "sequence",
  "fiber",
  "lattice",
  "gateway",
  "horizon",
  "checkpoint",
  "registry",
  "manifold",
  "pipeline",
  "topology",
  "envelope",
  "scheduler",
];

const TOPICS = [
  "edge computing",
  "event sourcing",
  "eventual consistency",
  "backpressure",
  "cold starts",
  "write amplification",
  "tail latency",
  "graceful degradation",
  "leader election",
  "log compaction",
  "content addressing",
  "structured concurrency",
  "durable execution",
  "hibernation",
  "rebasing",
];

const VERBS = [
  "rebalances",
  "replicates",
  "compacts",
  "materializes",
  "hibernates",
  "reconciles",
  "drains",
  "buffers",
  "fans out",
  "coalesces",
  "serializes",
  "snapshots",
];

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface Page {
  title: string;
  description: string;
  html: string;
}

export function buildPage(id: string, origin: string): Page {
  const rand = mulberry32(hash32(id));
  const pick = <T>(arr: readonly T[]): T =>
    arr[Math.floor(rand() * arr.length)];

  const title = titleCase(
    `the ${pick(ADJECTIVES)} ${pick(NOUNS)} of ${pick(TOPICS)}`
  );
  const topic = pick(TOPICS);
  const description = `A field note on how a ${pick(ADJECTIVES)} ${pick(
    NOUNS
  )} ${pick(VERBS)} under ${topic}. Reference id ${id}.`;

  const sentence = (): string => {
    const parts = [
      `The ${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(VERBS)} whenever ${pick(
        TOPICS
      )} crosses a ${pick(ADJECTIVES)} threshold`,
      `Operators favor a ${pick(ADJECTIVES)} ${pick(
        NOUNS
      )} because it ${pick(VERBS)} without blocking the ${pick(NOUNS)}`,
      `Under ${topic}, the ${pick(NOUNS)} ${pick(
        VERBS
      )} and the ${pick(ADJECTIVES)} ${pick(NOUNS)} stays consistent`,
    ];
    return pick(parts) + ".";
  };

  const paragraph = (): string => {
    const n = 3 + Math.floor(rand() * 3);
    const sentences: string[] = [];
    for (let i = 0; i < n; i++) sentences.push(sentence());
    return sentences.join(" ");
  };

  const paraCount = 3 + Math.floor(rand() * 3);
  const paragraphs: string[] = [];
  for (let i = 0; i < paraCount; i++) paragraphs.push(paragraph());

  const image = `${origin}/img/${encodeURIComponent(id)}`;
  const canonical = `${origin}/page/${encodeURIComponent(id)}`;
  const eTitle = escapeHtml(title);
  const eDesc = escapeHtml(description);

  const body = paragraphs
    .map((p) => `      <p>${escapeHtml(p)}</p>`)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${eTitle}</title>
    <meta name="description" content="${eDesc}" />
    <meta name="author" content="Mock Ingest" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${eTitle}" />
    <meta property="og:description" content="${eDesc}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <article>
      <h1>${eTitle}</h1>
      <p><em>${eDesc}</em></p>
${body}
    </article>
  </body>
</html>
`;

  return { title, description, html };
}

export function buildImage(id: string): string {
  const rand = mulberry32(hash32(id) ^ 0x9e3779b9);
  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 40 + Math.floor(rand() * 80)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 70% 45%)" />
      <stop offset="1" stop-color="hsl(${hue2} 70% 35%)" />
    </linearGradient>
  </defs>
  <rect width="600" height="315" fill="url(#g)" />
  <text x="30" y="180" font-family="monospace" font-size="28" fill="white">mock-ingest</text>
  <text x="30" y="220" font-family="monospace" font-size="20" fill="white" opacity="0.85">id ${escapeHtml(
    id
  )}</text>
</svg>
`;
}
