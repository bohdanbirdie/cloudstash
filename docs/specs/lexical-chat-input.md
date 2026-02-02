# Lexical Chat Input Spec

**Status:** Implemented (Phase 1-3), Phase 4 pending

## Overview

Replace the current `<textarea>` chat input with a Lexical editor to support:

1. **Slash commands** - `/help`, `/clear`, `/search`, `/save`, `/recent` with autocomplete
2. **Auto-lists only** - `- ` or `1. ` triggers list formatting, but NO other rich text (no bold, italic, code, headings, etc.)

## Implementation Status

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Basic editor + submit | ✅ Done |
| 2 | Auto-lists | ✅ Done |
| 3 | Slash commands (client) | ✅ Done |
| 4 | Slash commands (server) | ⏳ Pending |

## Files Created

| File | Purpose |
|------|---------|
| `src/components/chat/lexical/chat-editor.tsx` | Main editor component with submit button |
| `src/components/chat/lexical/plugins/slash-command-plugin.tsx` | Autocomplete menu + Enter/Tab selection |
| `src/components/chat/lexical/plugins/submit-plugin.tsx` | Enter to send (low priority, yields to slash menu) |
| `src/components/chat/lexical/plugins/list-shortcut-plugin.tsx` | Auto-list on `- ` or `1. ` |
| `src/shared/slash-commands.ts` | Command registry + parser |

## Dependencies

```bash
bun add lexical @lexical/react @lexical/list @lexical/markdown
```

Installed: `lexical@0.40.0`, `@lexical/react@0.40.0`, `@lexical/list@0.40.0`, `@lexical/markdown@0.40.0`

## Slash Commands

### Command Registry

```typescript
// src/shared/slash-commands.ts
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands", handler: "client" },
  { name: "clear", description: "Clear chat history", handler: "client" },
  { name: "search", description: "Search your links", args: "<query>", handler: "server" },
  { name: "save", description: "Save a new link", args: "<url>", handler: "server" },
  { name: "recent", description: "Show recent links", args: "[count]", handler: "server" },
];
```

### Autocomplete Behavior (Implemented)

1. Type `/` → menu appears above input (anchored to editor container)
2. Filter as you type (`/se` → `/search`, `/save`)
3. Up/Down arrows navigate options
4. **Enter** or **Tab** selects + adds trailing space
5. Escape dismisses menu
6. Click to select

### Key Implementation Details

**Priority Handling:**
- `SlashCommandPlugin` registers Enter handler with `COMMAND_PRIORITY_HIGH`
- `SubmitPlugin` uses `COMMAND_PRIORITY_LOW`
- When menu is open, slash plugin handles Enter; when closed, submit plugin handles it

**Menu Positioning:**
- Portal to editor container ref (not inline anchor)
- Uses `absolute bottom-full left-0` to appear above input

## Command Handling Flow

```
User types "/search react" and presses Enter
    │
    ├─ If menu is open (mid-autocomplete):
    │   └─ SlashCommandPlugin intercepts Enter → selects command → adds space
    │
    └─ If menu is closed (command complete):
        └─ SubmitPlugin gets Enter → calls handleSubmit(text)
            │
            └─ ChatEditor.handleSubmit() parses "/search react"
                │
                └─ Calls onSlashCommand(command, args)
                    │
                    ├─ Client commands (help, clear):
                    │   └─ Handled immediately in chat-content.tsx
                    │
                    └─ Server commands (search, save, recent):
                        └─ Sent as message to ChatAgentDO
```

## Client Command Handling (Implemented)

In `chat-content.tsx`:

```typescript
const handleSlashCommand = useCallback(
  (command: SlashCommand, args: string) => {
    if (command.handler === "client") {
      if (command.name === "clear") {
        clearHistory();
        return;
      }
      if (command.name === "help") {
        const helpText = SLASH_COMMANDS.map(
          (c) => `/${c.name}${c.args ? ` ${c.args}` : ""} - ${c.description}`
        ).join("\n");
        sendMessage({
          role: "user",
          parts: [{ type: "text", text: `/help\n\n${helpText}` }],
        });
        return;
      }
    }

    // Server commands: send as regular message
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: `/${command.name}${args ? ` ${args}` : ""}` }],
    });
  },
  [clearHistory, sendMessage]
);
```

## Server Command Handling (TODO)

### Option A: Bypass LLM entirely

Fast, deterministic responses. Update `ChatAgentDO.onChatMessage()`:

```typescript
async onChatMessage() {
  const lastMessage = this.messages.at(-1);
  const text = getTextContent(lastMessage);

  // Check for slash command
  if (text?.startsWith("/")) {
    const result = await this.handleSlashCommand(text);
    if (result) return result;
  }

  // Normal LLM flow...
}

private async handleSlashCommand(text: string): Promise<Response | null> {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;

  const [, command, args = ""] = match;
  const store = await this.getStore(); // Get LiveStore instance

  switch (command) {
    case "search":
      return this.respondWithJson(await this.executeSearch(store, args.trim()));
    case "save":
      return this.respondWithJson(await this.executeSave(store, args.trim()));
    case "recent":
      return this.respondWithJson(await this.executeRecent(store, parseInt(args) || 5));
    default:
      return null; // Unknown command, let LLM handle
  }
}

private async executeSearch(store: Store, query: string) {
  const results = store.query(searchLinks$(query));
  return {
    type: "search-results",
    query,
    results: results.slice(0, 10).map(link => ({
      id: link.id,
      url: link.url,
      title: link.title || link.domain,
    })),
  };
}

private async executeSave(store: Store, url: string) {
  if (!isValidUrl(url)) {
    return { type: "error", message: "Invalid URL" };
  }
  const linkId = nanoid();
  const domain = new URL(url).hostname.replace(/^www\./, "");
  store.commit(events.linkCreated({ id: linkId, url, domain, createdAt: new Date() }));
  return { type: "link-saved", linkId, url, domain };
}

private async executeRecent(store: Store, count: number) {
  const links = store.query(allLinks$);
  return {
    type: "recent-links",
    links: links.slice(0, Math.min(count, 20)).map(link => ({
      id: link.id,
      url: link.url,
      title: link.title || link.domain,
    })),
  };
}

private respondWithJson(data: unknown): Response {
  // Create a streaming response that the UI can render
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({
        type: "text",
        text: JSON.stringify(data),
      });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
```

### Option B: Let LLM handle with tool calls

Simpler, more flexible. Just send the command as a message and let LLM decide:

```typescript
// No special handling needed - LLM will interpret "/search react"
// and call the searchLinks tool
```

**Recommendation:** Start with Option B (simpler), switch to Option A if you want faster responses or consistent formatting.

## Frontend: Rich Command Results (Future)

For Option A, render structured results instead of JSON:

```typescript
// In ChatMessage component, detect command results
if (textContent.startsWith('{"type":"search-results"')) {
  const data = JSON.parse(textContent);
  return <SearchResultsCard results={data.results} query={data.query} />;
}
```

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Clear confirmation? | No - instant clear, can use `/recent` to see what was there |
| Help display? | Show as user message with formatted list |
| Unknown commands? | Let LLM handle - it might understand intent |
| Enter vs Tab? | Both select + add space |

## References

- [Lexical Plugins Docs](https://lexical.dev/docs/react/plugins)
- [LexicalTypeaheadMenuPlugin](https://lexical.dev/docs/react/plugins#lexicaltypeaheadmenuplugin)
- [@lexical/markdown](https://lexical.dev/docs/packages/lexical-markdown)
