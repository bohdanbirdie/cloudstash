# Links API

Status: **implemented**. This task began as a read-only endpoint and now covers
the public link-operation contract shared with MCP.

## Current surface

- `GET /api/links` — cursor list or ranked search with state/date filters
- `GET /api/links/:id` — complete link record
- `POST /api/links` — save an HTTP(S) URL with optional tags
- `PATCH /api/links/:id` — update state or tags
- `POST /api/links/batch-update` — bounded state/tag updates
- `POST /api/ingest` — legacy queue-backed compatibility intake

Every operation authenticates an API key, resolves its workspace, and enforces
the Plus+ `publicApi` capability before calling the workspace-named
`LinkProcessorDO`. Reprocessing remains unavailable outside the admin app UI.

Search defaults to relevance-ranked any-term matching across title, tags,
domain, description, summary, and URL. `match=all` requires every query term.
Collection state defaults to `active` (inbox + completed); `archive` selects
archived links and `any` selects full history. Legacy `all` aliases `active`.

## Canonical contract

`src/components/integrations/api-spec.ts` owns the structured in-app reference
and the self-contained “Copy for agents” specification. The rendered Developers
card and its tests derive from that file. Durable behavior is recorded in
`context/02-system/06-retrieval-and-agent/spec.md`; executable schemas live in
`src/lib/links-contract.ts`.

The API and MCP share the same Effect domain service and LinkProcessorDO RPCs,
so pagination, search, mutations, state filters, and validation do not drift by
transport.
