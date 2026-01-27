# Future Plans

Ideas for future features and improvements. Detailed specs are in `/docs/specs/`.

---

## Priority

1. **Dynamic categories** - High-value user feature
2. **Telemetry dashboard** - Monitoring and insights
3. **LiveStore MCP integration** - AI/agent features
4. **Raycast extension** - Quick link saving for macOS users (UI done, extension not built)

---

## Features

### Dynamic Categories

User-defined categories with sensible defaults.

**Spec:** [dynamic-categories.md](specs/dynamic-categories.md)

- Default categories: Reading, Watch Later, Reference, etc.
- Users can create/edit/delete categories
- Assign category when saving link (optional)
- Filter links by category in UI
- Drag-and-drop reordering

### ~~Opt-in AI Summaries~~ ✓

**Done.** See [features/ai-summaries.md](features/ai-summaries.md)

### Telemetry Dashboard

Custom UI for monitoring link processing, user activity, and system health.

**Spec:** [telemetry-dashboard.md](specs/telemetry-dashboard.md)

- Leverages LiveStore's built-in OpenTelemetry integration
- Real-time metrics from computed queries
- Historical trends via periodic snapshots
- Stats: total links, processing success rate, top domains
- Recent errors table with context
- Links over time chart

### Raycast Extension

Save links by pasting directly into Raycast (macOS).

**Spec:** [raycast-extension.md](specs/raycast-extension.md)

**Done:**

- API key generation UI in integrations modal

**Todo:**

- Build Raycast extension
- Paste URL in Raycast → "Save to Cloudstash" command appears
- API key stored in Raycast preferences (Keychain)
- Reuses existing `/api/ingest` endpoint
- Publish to Raycast Store

### LiveStore MCP Integration

Expose LiveStore to LLMs via Model Context Protocol.

**Spec:** [livestore-mcp-integration.md](specs/livestore-mcp-integration.md)

- MCP server on Cloudflare Workers
- Tools: save_link, search_links, list_links, delete_link, set_category
- Resources: links, categories, stats
- Prompts: organize_links, weekly_digest, find_related
- Claude Desktop integration

---

## Technical Review

### Rate Limiting Approach

Review and consolidate rate limiting strategy across the app.

**Current state:**

- API key rate limiting uses D1 (counters stored in `apiKey` table)
- Better Auth general rate limiting defaults to in-memory (not ideal for Workers)
- No rate limiting on cookie-authenticated endpoints

**To review:**

- Consider adding `storage: "database"` to Better Auth config for general rate limiting
- Evaluate if invite redeem endpoint needs rate limiting (brute-force protection)
- Audit other endpoints that might need rate limiting (login, signup, etc.)
- Decide on unified approach: D1 vs KV vs Better Auth built-in
