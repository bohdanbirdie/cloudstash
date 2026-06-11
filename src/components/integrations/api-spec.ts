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
  method: "GET" | "POST";
  path: string;
  summary: string;
  description: string;
  query?: ApiField[];
  body?: ApiField[];
  responseFields?: ApiField[];
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
      "Returns saved links newest-first with their AI summary, tags, and processing state. Cursor-paginated.",
    query: [
      {
        name: "state",
        type: "string",
        description:
          'One of "inbox", "completed", "all", "archive". Default "all" (inbox + completed; archived excluded).',
      },
      {
        name: "limit",
        type: "integer",
        description: "Page size, 1–100. Default 50.",
      },
      {
        name: "cursor",
        type: "string",
        description:
          "Opaque keyset token from a previous response's nextCursor. Omit for the first page.",
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
        type: '"inbox" | "completed"',
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
        name: "completedAt",
        type: "string | null",
        description: "ISO 8601 timestamp, or null.",
      },
    ],
    curl: (origin) =>
      `curl "${origin}/api/links?state=all&limit=50" \\\n  -H "Authorization: Bearer ${KEY_VAR}"`,
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
      { status: 400, when: "Invalid state, limit, or cursor." },
      { status: 401, when: "Missing or invalid API key." },
      { status: 402, when: "Plan without Public API (free)." },
      { status: 404, when: "Organization not found." },
      { status: 500, when: "Internal error." },
    ],
  },
  {
    id: "ingest",
    method: "POST",
    path: "/api/ingest",
    summary: "Save a link",
    description:
      "Queues a URL to be saved and processed (metadata fetch + AI summary). Returns immediately; processing runs asynchronously.",
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
      "",
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
    "This is the HTTP API specification for Cloudstash — a link-saving app that fetches each saved link's metadata and writes an AI-generated summary. Use it to read a workspace's saved links (with their AI summaries, tags, and processing state) and to save new links programmatically, for building integrations, scripts, or agent tools on top of a Cloudstash library.",
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
