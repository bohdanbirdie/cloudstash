# GET links API

A read-only, API-key-authenticated endpoint that returns an org's saved links
with their AI summary, tags, and processing state. Built for integrations (CLI,
Raycast, Chrome extension, third parties) that want to read the library over
HTTP rather than running a Livestore client.

Status: **implemented + verified live** (route + DO RPC + encoder + unit tests;
e2e tested against a real API key/store — auth, param validation, reads, cursor
pagination, and merged tags all confirmed).

## Endpoint

```
GET /api/links
Authorization: Bearer <apiKey>
```

Auth reuses the existing API-key path (`verifyApiKey` → `decodeApiKeyMetadata`),
so the org is resolved from the key's metadata — identical to the extension and
Raycast connect endpoints. No cookie/session path.

**Gated on the `publicApi` capability (Plus+).** After resolving `orgId`, the
handler calls `requireCapability(orgId, "publicApi")` and returns `402` for free
orgs **before** touching the store — a denied org must not spin up the billable
`ChatAgentDO` replica. Necessary because free orgs hold valid API keys (the
Chrome extension mints them ungated), so request-time enforcement is the only
thing that actually keeps the Public API on Plus+. Mirrors `gateUserApiKeyCreate`
(which gates key _creation_) and the connect endpoints' capability checks.

### Query params

| param    | default | notes                                                                                  |
| -------- | ------- | -------------------------------------------------------------------------------------- |
| `state`  | `all`   | `inbox \| completed \| all \| archive`. `all` = inbox + completed (archived excluded). |
| `limit`  | `50`    | page size, 1–100.                                                                      |
| `cursor` | —       | opaque keyset token; omit for the first page.                                          |

Invalid `state`/`limit`/`cursor` → `400`.

## Response

```jsonc
// 200
{
  "links": [
    {
      "id": "01HXXX…",
      "url": "https://example.com/post",
      "title": "Post title", // string | null
      "description": "OG/meta excerpt…", // string | null
      "summary": "AI-generated summary…", // string | null
      "domain": "example.com",
      "image": "https://…/og.png", // string | null
      "favicon": "https://…/favicon.ico", // string | null
      "tags": ["ai", "reading"], // string[]  (accepted + pending AI suggestions)
      "state": "inbox", // "inbox" | "completed"
      "processing": "done", // "pending"|"processing"|"done"|"failed"|"none"
      "source": "extension", // string | null
      "createdAt": "2026-06-10T09:12:00.000Z", // ISO 8601
      "completedAt": null, // ISO 8601 | null
    },
  ],
  "total": 142, // count of the whole filtered set (ignores page)
  "nextCursor": "eyJ0IjoxNzE4…", // string | null  (null ⇒ last page)
}
```

### Field semantics

- **Two statuses, decoupled.** `state` is the user's read state (inbox vs. done,
  from `links.status` where `unread → inbox`). `processing` is the AI pipeline
  (from `link_processing_status`). They are independent: `processing:"done"` with
  `summary:null` is valid (page processed, but the org has no AI summary) — do
  not infer one from the other.
- **`processing` mapping** from the internal status:
  `pending→pending`, `processing`/`reprocess-requested`→`processing`,
  `completed→done`, `failed`/`cancelled`→`failed`, no row→`none`.
- **`tags`** are names (not ids), merged to match the app's link tag strip:
  accepted tags (`link_tags`, by sortOrder) first, then pending AI suggestions
  (`tag_suggestions` status `pending`, by suggestedAt), de-duplicated by name
  (accepted wins). Tag ids are slug-of-name and unstable, so names are the safer
  thing to expose.
- **Timestamps** are ISO 8601 strings.

## Pagination (cursor / keyset)

Chosen over offset because the feed is reverse-chronological with top-of-feed
inserts — offset would duplicate/skip rows as new links are saved, and is slower
at depth.

- Ordering is `createdAt DESC, id DESC` for **all** `state` values. The API picks
  one stable sort key; this deliberately diverges from the in-app views, which
  sort `completed` by `completedAt` and `archive` by `deletedAt`.
- The `id` tie-breaker is required because `createdAt` (epoch ms) isn't unique
  under bulk imports — without it keyset pagination can drop or repeat rows.
- The cursor is `base64url({ t: createdAt, id })`, treated as opaque by clients.
- The query fetches `limit + 1` rows; the extra row signals (and is dropped to
  build) `nextCursor`. `nextCursor: null` ⇒ last page.

Client loop: call with no cursor, then keep passing back `nextCursor` until it's
`null`.

## Errors

| status | body                                                   | when                            |
| ------ | ------------------------------------------------------ | ------------------------------- |
| `400`  | `{"error":"Invalid state\|limit\|cursor"}`             | bad params                      |
| `401`  | `{"error":"Unauthorized"}`                             | missing/invalid bearer key      |
| `402`  | `{error, capability:"publicApi", requiredTier:"plus"}` | free org (no `publicApi` cap)   |
| `404`  | `{"error":"Organization not found"}`                   | org missing                     |
| `503`  | `{"error":"Auth backend unavailable"}`                 | `verifyApiKey` threw            |
| `500`  | `{"error":"Internal error"}`                           | capability/store/DO read failed |

## Implementation

Links live in Livestore SQLite hosted per-org by a DO — there is no stateless
read path. The endpoint routes the API-key request to the **existing per-org
store DO** (`ChatAgentDO`, addressed by `idFromName(orgId)`, which already runs a
live store for chat) via a new read-only RPC, rather than standing up a second
full replica per org.

| concern                                                            | location                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Route                                                              | `src/cf-worker/index.ts` → `GET /api/links`                          |
| Handler (auth, param parse, RPC, response/error envelope)          | `src/cf-worker/links/handler.ts`                                     |
| Pure encoder, cursor codec, param parsing, tag grouping, API types | `src/cf-worker/links/api.ts`                                         |
| Keyset query + per-state count selector                            | `src/livestore/queries/links.ts` (`apiLinksPage$`, `apiLinksCount$`) |
| Row schema                                                         | `src/livestore/queries/schemas.ts` (`ApiLinkRowSchema`)              |
| DO RPC                                                             | `src/cf-worker/chat-agent/index.ts` (`ChatAgentDO.listLinks`)        |
| Unit tests                                                         | `src/cf-worker/links/__tests__/api.test.ts`                          |

Per-org isolation comes from the store being per-org (storeId = orgId); the SQL
itself is not org-scoped.

## In-app API reference (UI)

Both the API keys and the reference live in a dedicated **Developers** settings
tab (`SettingsSection "developers"` in `settings-dialog.tsx` →
`src/components/settings/sections/developers-section.tsx`). The keys card
(`developers-card.tsx`, titled "API keys") was moved out of the Integrations tab;
Integrations now only holds the first-party connectors (X, Telegram, Raycast,
Chrome). The account menu has a "Developers" quick-link.

The **API Reference** card (`src/components/integrations/api-reference-card.tsx`)
is paywalled on the same `publicApi` capability: free orgs see a one-line locked
note (no second CTA — the keys card above carries the upgrade button); Plus/Pro
see the full reference. To keep it compact in the fixed-height modal, it uses
progressive disclosure: an always-visible **quickstart** (base URL = live
`window.location.origin`, the `Authorization: Bearer` header), then each endpoint
(`GET /api/links`, `POST /api/ingest`) is an **Accordion item collapsed by
default**; inside the GET endpoint the long link-field table is a further nested
"Response fields" disclosure. Every code block has a copy button.

A **Copy for agents** button (card header) copies a complete, self-contained
markdown spec (base URL + auth + both endpoints) suitable for pasting into an
LLM/agent.

Single source of truth: `src/components/integrations/api-spec.ts` holds the
structured `API_ENDPOINTS` data and `buildAgentSpec(origin)`. Both the rendered
card and the agent blob derive from it — **edit `api-spec.ts` when the API
changes** so the UI, the agent spec, and the real endpoints stay in sync. Covered
by `src/components/integrations/__tests__/api-spec.test.ts` (component pure-logic
tests are now included by `vitest.config.ts`).

## Future considerations (not in v1)

- **Rate limiting.** `/api/links` is not in `RATE_LIMITED_PREFIXES`. Reads hit a
  DO; consider an IP or per-key limit if abused.
- **`?tag=` / search filters** could layer onto the same keyset query.
- **`archivedAt`** could be surfaced for `state=archive` if a consumer needs it.
- **First-call cost** for orgs that never use chat: the first `/api/links` cold-
  starts the `ChatAgentDO` store (full materialize). Warm thereafter.
