export const API_FALLBACK_ORIGIN = "https://cloudstash.app";

export const apiOrigin = (): string =>
  typeof window === "undefined" ? API_FALLBACK_ORIGIN : window.location.origin;

export interface ApiField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface ApiError {
  status: number;
  when: string;
}

export interface ApiEndpoint {
  id: string;
  method: "GET" | "POST" | "PATCH";
  path: string;
  summary: string;
  description: string;
  query?: ApiField[];
  body?: ApiField[];
  responseFields?: ApiField[];
  paginated?: boolean;
  curl: (origin: string) => string;
  response: string;
  errors: ApiError[];
}

const KEY_VAR = "$CLOUDSTASH_API_KEY";

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    id: "list-links",
    method: "GET",
    path: "/api/links",
    summary: "List saved links",
    description:
      "Lists saved links with cursor pagination. Add q for relevance-ranked any-term search across titles, tags, domains, descriptions, summaries, and URLs.",
    query: [
      {
        name: "q",
        type: "string",
        description:
          "Optional full-text search query. Returns up to limit matches.",
      },
      {
        name: "match",
        type: '"any" | "all"',
        description:
          'Search term matching when q is present. Default "any" ranks every link matching at least one term; "all" requires every term.',
      },
      {
        name: "state",
        type: '"inbox" | "completed" | "active" | "archive" | "any" | "all"',
        description:
          'Default "active" includes inbox + completed and excludes archived links. Use "archive" for archived only or "any" for full history. Legacy "all" aliases "active".',
      },
      {
        name: "limit",
        type: "integer",
        description:
          "Page size, 1–100 (or 1–20 when q is present). Defaults to 50 for lists and 20 for search.",
      },
      {
        name: "sort",
        type: '"newest" | "oldest"',
        description: 'Saved-date order. Default "newest".',
      },
      {
        name: "createdAfter / createdBefore",
        type: "ISO 8601 string",
        description:
          "Optional saved-date range (inclusive start, exclusive end).",
      },
      {
        name: "cursor",
        type: "string",
        description:
          "Opaque keyset token from a previous list response. Omit for the first page and when q is present.",
      },
    ],
    responseFields: [
      { name: "id", type: "string", description: "Link id." },
      { name: "url", type: "string", description: "Saved URL." },
      { name: "domain", type: "string", description: "Host of the URL." },
      {
        name: "title",
        type: "string | null",
        description: "Page title.",
      },
      {
        name: "description",
        type: "string | null",
        description: "Meta/OG excerpt.",
      },
      {
        name: "summary",
        type: "string | null",
        description: "AI-generated summary.",
      },
      {
        name: "image",
        type: "string | null",
        description: "OG image URL.",
      },
      {
        name: "favicon",
        type: "string | null",
        description: "Favicon URL.",
      },
      {
        name: "tags",
        type: "string[]",
        description: "Tag names (accepted tags + pending AI suggestions).",
      },
      {
        name: "state",
        type: '"inbox" | "completed" | "archive"',
        description: "The user's read state.",
      },
      {
        name: "processing",
        type: '"pending" | "processing" | "done" | "failed" | "none"',
        description:
          'AI pipeline state. Independent of state — "done" with summary null is valid.',
      },
      {
        name: "source",
        type: "string | null",
        description: 'Where it was saved from (e.g. "extension", "api").',
      },
      {
        name: "createdAt",
        type: "string",
        description: "ISO 8601 timestamp.",
      },
      {
        name: "deletedAt",
        type: "string | null",
        description: "Archive timestamp, or null.",
      },
      {
        name: "completedAt",
        type: "string | null",
        description: "ISO 8601 timestamp, or null.",
      },
    ],
    paginated: true,
    curl: (origin) =>
      `curl "${origin}/api/links?state=active&limit=50" \\\n  -H "Authorization: Bearer ${KEY_VAR}"`,
    response: `{
  "links": [
    {
      "id": "01HXXX...",
      "url": "https://example.com/post",
      "title": "Post title",
      "description": "OG/meta excerpt",
      "summary": "AI-generated summary",
      "domain": "example.com",
      "image": "https://.../og.png",
      "favicon": "https://.../favicon.ico",
      "tags": ["ai", "reading"],
      "state": "inbox",
      "processing": "done",
      "source": "extension",
      "createdAt": "2026-06-10T09:12:00.000Z",
      "completedAt": null
    }
  ],
  "total": 142,
  "nextCursor": "eyJ0IjoxNzE4..."
}`,
    errors: [
      { status: 400, when: "Invalid state, match, limit, or cursor." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 404, when: "Organization not found." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "create-link",
    method: "POST",
    path: "/api/links",
    summary: "Save a link",
    description:
      "Saves an HTTP(S) URL and optionally attaches tags atomically. Existing URLs are returned and receive any new tags.",
    body: [
      {
        name: "url",
        type: "string",
        required: true,
        description: "HTTP(S) URL to save.",
      },
      {
        name: "tags",
        type: "string[]",
        description: "Up to 20 tag names.",
      },
    ],
    curl: (origin) =>
      `curl -X POST "${origin}/api/links" \\\n  -H "Authorization: Bearer ${KEY_VAR}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com/post","tags":["reading"]}'`,
    response: `{
  "created": true,
  "link": { "id": "01HXXX...", "url": "https://example.com/post", "tags": ["reading"], "state": "inbox" }
}`,
    errors: [
      { status: 400, when: "Invalid URL, tags, or request fields." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 413, when: "Request body exceeds 64 KiB." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "get-link",
    method: "GET",
    path: "/api/links/:id",
    summary: "Get a link",
    description: "Returns one complete saved-link record by id.",
    curl: (origin) =>
      `curl "${origin}/api/links/01HXXX..." \\\n  -H "Authorization: Bearer ${KEY_VAR}"`,
    response: `{
  "id": "01HXXX...",
  "url": "https://example.com/post",
  "tags": ["reading"],
  "state": "inbox",
  "processing": "done"
}`,
    errors: [
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 404, when: "Link or organization not found." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "update-link",
    method: "PATCH",
    path: "/api/links/:id",
    summary: "Update a link",
    description:
      "Changes inbox/completed/archive state or adds, removes, or replaces tags. URL, generated metadata, and reprocessing are not mutable through the API.",
    body: [
      {
        name: "state",
        type: '"inbox" | "completed" | "archive"',
        description: "Optional new state.",
      },
      {
        name: "tags",
        type: "{ add?: string[]; remove?: string[]; set?: string[] }",
        description:
          "Optional tag mutation. set cannot be combined with add/remove.",
      },
    ],
    curl: (origin) =>
      `curl -X PATCH "${origin}/api/links/01HXXX..." \\\n  -H "Authorization: Bearer ${KEY_VAR}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"state":"completed","tags":{"add":["done"]}}'`,
    response: `{
  "id": "01HXXX...",
  "state": "completed",
  "tags": ["reading", "done"]
}`,
    errors: [
      { status: 400, when: "Invalid or unsupported change." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 404, when: "Link or organization not found." },
      { status: 413, when: "Request body exceeds 64 KiB." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "update-links",
    method: "POST",
    path: "/api/links/batch-update",
    summary: "Update links in a bounded batch",
    description:
      "Updates up to 100 links selected either by ids or by state/saved-date filters. Continue with nextCursor for larger sets.",
    body: [
      {
        name: "ids / where",
        type: "string[] / filter",
        required: true,
        description:
          "Provide exactly one. where supports state, createdAfter, createdBefore, and cursor.",
      },
      {
        name: "changes",
        type: "object",
        required: true,
        description:
          "The same state/tag changes accepted by PATCH /api/links/:id.",
      },
      {
        name: "limit",
        type: "integer",
        description: "Maximum links to update, 1–100. Default 100.",
      },
    ],
    curl: (origin) =>
      `curl -X POST "${origin}/api/links/batch-update" \\\n  -H "Authorization: Bearer ${KEY_VAR}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"where":{"createdBefore":"2025-01-01T00:00:00Z"},"changes":{"state":"completed"}}'`,
    response: `{
  "updated": 42,
  "links": [],
  "nextCursor": null
}`,
    errors: [
      { status: 400, when: "Invalid selector, cursor, limit, or changes." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 413, when: "Request body exceeds 64 KiB." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "ingest",
    method: "POST",
    path: "/api/ingest",
    summary: "Queue a link (legacy)",
    description:
      "Compatibility endpoint that queues a URL without tags. New integrations should use POST /api/links.",
    body: [
      {
        name: "url",
        type: "string",
        required: true,
        description: "The URL to save.",
      },
    ],
    curl: (origin) =>
      `curl -X POST "${origin}/api/ingest" \\\n  -H "Authorization: Bearer ${KEY_VAR}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url":"https://example.com/post"}'`,
    response: `{ "status": "queued" }`,
    errors: [
      { status: 400, when: "Missing or invalid url." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 404, when: "Organization not found." },
      { status: 500, when: "Internal error." },
    ],
  },
];

const fieldLine = (f: ApiField): string =>
  `- ${f.name} (${f.type}${f.required ? ", required" : ", optional"}) — ${f.description}`;

const responseFieldLine = (f: ApiField): string =>
  `- ${f.name} (${f.type}) — ${f.description}`;

function endpointSpec(endpoint: ApiEndpoint, origin: string): string {
  const parts: string[] = [
    `## ${endpoint.method} ${endpoint.path} — ${endpoint.summary}`,
    "",
    endpoint.description,
    "",
  ];

  if (endpoint.query?.length) {
    parts.push("Query params:", ...endpoint.query.map(fieldLine), "");
  }
  if (endpoint.body?.length) {
    parts.push("Request body (JSON):", ...endpoint.body.map(fieldLine), "");
  }

  parts.push("Example:", "```bash", endpoint.curl(origin), "```", "");
  parts.push("Response (200):", "```json", endpoint.response, "```", "");

  if (endpoint.responseFields?.length) {
    parts.push(
      "Link fields:",
      ...endpoint.responseFields.map(responseFieldLine),
      ""
    );
  }
  if (endpoint.paginated) {
    parts.push(
      "Top-level fields:",
      "- total (integer) — count of the whole filtered set, ignoring the current page.",
      "- nextCursor (string | null) — pass back to fetch the next page; null on the last page.",
      "",
      "Pagination: call with no cursor, then keep passing the returned nextCursor until it is null.",
      ""
    );
  }

  parts.push(
    "Errors:",
    ...endpoint.errors.map((e) => `- ${e.status} — ${e.when}`)
  );

  return parts.join("\n");
}

export function buildAgentSpec(origin: string): string {
  return [
    "# Cloudstash API",
    "",
    "This is the HTTP API specification for Cloudstash. Use it to list, search, save, read, and update a workspace's links. Link reprocessing remains an admin-only action in the Cloudstash app.",
    "",
    `This spec was copied from the in-app API reference (Settings → Developers) at ${origin}. It is self-contained: every endpoint, query parameter, request body, response field, and error code is documented below.`,
    "",
    `Base URL: ${origin}`,
    "Auth: send `Authorization: Bearer <API_KEY>` on every request.",
    "Plan: the Public API is available on Plus and Pro. Free organizations receive 402.",
    "Create an API key in Cloudstash → Settings → Developers.",
    "",
    API_ENDPOINTS.map((e) => endpointSpec(e, origin)).join("\n\n"),
    "",
  ].join("\n");
}
