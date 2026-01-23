# Future Plans

Ideas for future features and improvements. Detailed specs are in `/docs/specs/`.

---

## Priority

1. **Logout cleanup** - Bug fix, important for shared devices
2. **Dynamic categories** - High-value user feature
3. **Opt-in AI summaries** - Cost optimization
4. **Admin UI + registration approval** - Needed for public launch
5. **Telemetry dashboard** - Monitoring and insights
6. **LiveStore MCP integration** - AI/agent features

---

## Features

### Logout Cleanup

Clear OPFS data after logout to prevent stale data on shared devices.

**Spec:** [logout-cleanup.md](specs/logout-cleanup.md)

- Shutdown livestore properly before clearing
- Clear OPFS/IndexedDB storage after logout
- Ensure clean state on next login

### Dynamic Categories

User-defined categories with sensible defaults.

**Spec:** [dynamic-categories.md](specs/dynamic-categories.md)

- Default categories: Reading, Watch Later, Reference, etc.
- Users can create/edit/delete categories
- Assign category when saving link (optional)
- Filter links by category in UI
- Drag-and-drop reordering

### Opt-in AI Summaries

AI summary generation disabled by default. Users can enable it in settings.

**Spec:** [opt-in-ai-summaries.md](specs/opt-in-ai-summaries.md)

- Add `aiSummaryEnabled` setting per org
- Skip summary generation in LinkProcessorDO if disabled
- Settings UI toggle
- Reduces Workers AI costs for users who don't need it

### Admin UI & User Approval

Disable open registration. Admin dashboard for managing users.

**Spec:** [admin-user-approval.md](specs/admin-user-approval.md)

- Better Auth admin plugin integration
- Add `approved` field to user table
- Block unapproved users from accessing the app
- View all users, orgs, usage stats
- Approve/reject new registrations

### Telemetry Dashboard

Custom UI for monitoring link processing, user activity, and system health.

**Spec:** [telemetry-dashboard.md](specs/telemetry-dashboard.md)

- Leverages LiveStore's built-in OpenTelemetry integration
- Real-time metrics from computed queries
- Historical trends via periodic snapshots
- Stats: total links, processing success rate, top domains
- Recent errors table with context
- Links over time chart

### LiveStore MCP Integration

Expose LiveStore to LLMs via Model Context Protocol.

**Spec:** [livestore-mcp-integration.md](specs/livestore-mcp-integration.md)

- MCP server on Cloudflare Workers
- Tools: save_link, search_links, list_links, delete_link, set_category
- Resources: links, categories, stats
- Prompts: organize_links, weekly_digest, find_related
- Claude Desktop integration
