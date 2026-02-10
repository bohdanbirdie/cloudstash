# Future Plans

Ideas for future features and improvements. Detailed specs are in `/docs/specs/`.

---

## Priority

1. **Dynamic tags** - High-value user feature (flexible multi-tag organization)
2. **Telemetry dashboard** - Monitoring and insights
3. **LiveStore MCP integration** - AI/agent features
4. **Raycast extension** - Quick link saving for macOS users (UI done, extension not built)

---

## Features

### Dynamic Tags

Flexible multi-tag organization for links (chosen over single-category folders).

**Spec:** [dynamic-categories.md](specs/dynamic-categories.md)

- Multiple tags per link (not forced to choose one)
- Default tags: Reading, Watch, Reference, Work
- Save now, tag later workflow
- Filter by tag in sidebar (shift-click for AND filtering)
- Tag management: create, edit, merge, delete
- `#hashtag` support in Telegram/Raycast

**Future enhancements:**

- AI auto-tagging: Agent suggests tags based on link content
- Tag graph: Obsidian-style visualization of tag relationships

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

### WhatsApp Integration

Save links via WhatsApp messages, mirroring the existing Telegram bot.

**Spec:** [whatsapp-integration.md](specs/whatsapp-integration.md)

- Uses WhatsApp Cloud API (Meta-hosted)
- Commands: `/connect`, `/disconnect`, `/help`
- Free for user-initiated conversations (24h service window)
- Same KV pattern as Telegram for phone→API key mapping
- Webhook with HMAC-SHA256 signature verification

### LiveStore MCP Integration

Expose LiveStore to LLMs via Model Context Protocol.

**Spec:** [livestore-mcp-integration.md](specs/livestore-mcp-integration.md)

- MCP server on Cloudflare Workers
- Tools: save_link, search_links, list_links, delete_link, set_category
- Resources: links, categories, stats
- Prompts: organize_links, weekly_digest, find_related
- Claude Desktop integration

### Chat Agent BYOK (Bring Your Own Key)

Allow users to provide their own LLM API keys instead of using shared Groq key.

**Reference:** [chat-agent.md](features/chat-agent.md) (Provider Pricing section)

- Store encrypted API keys per org in D1
- Support OpenAI, Anthropic, Google Gemini
- Allow users to select provider + model in settings
- Fall back to platform key (Groq) if no BYOK configured

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
