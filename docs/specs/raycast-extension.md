# Raycast Extension Integration

Save links by pasting them directly into Raycast.

## User Experience

### Primary Flow: Paste URL in Raycast

```
┌────────────────────────────────────────┐
│ Raycast                          ⌘ + Space
├────────────────────────────────────────┤
│ > https://example.com/article          │
│                                        │
│   Save to Cloudstash            ⏎     │  ← extension command
│   Open URL                             │
│   Copy to Clipboard                    │
└────────────────────────────────────────┘
```

1. `Cmd+Space` → open Raycast
2. `Cmd+V` → paste URL
3. "Save to Cloudstash" appears as option
4. `Enter` → saved, shows "Link saved!" toast

**That's it.** 4 keystrokes: `⌘Space`, `⌘V`, `Enter`.

### Secondary Flow: Global Hotkey (Power Users)

For even faster saving without opening Raycast UI:

1. Copy URL anywhere
2. Press `Cmd+Shift+L` (user-configured hotkey)
3. Toast shows "Link saved!"

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SETUP (one-time)                                │
│                                                                              │
│  ┌──────────┐  1. generate key     ┌──────────┐                             │
│  │  Web App │  with metadata:      │    D1    │  apiKey table (Better Auth) │
│  │ Settings │  { orgId }           │          │  stores: key → metadata     │
│  └──────────┘ ────────────────────►│          │                             │
│       │                            └──────────┘                             │
│       │ 2. show key once                                                    │
│       ▼                                                                     │
│  ┌──────────┐  3. paste in         ┌──────────┐                             │
│  │ Raycast  │  preferences         │ Keychain │  macOS secure storage       │
│  │Extension │ ────────────────────►│          │  (Raycast manages this)     │
│  └──────────┘                      └──────────┘                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           LINK SAVING (each time)                            │
│                                                                              │
│  ┌──────────┐  1. ⌘Space → paste URL                                        │
│  │   User   │  2. select "Save to Cloudstash"                              │
│  └──────────┘                                                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌──────────┐  3. POST /api/ingest                                          │
│  │ Raycast  │     Authorization: Bearer <api-key>                           │
│  │Extension │     Body: { "url": "..." }                                    │
│  └──────────┘                                                               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌──────────┐  4. verify key       ┌──────────┐                             │
│  │ CF Worker│ ────────────────────►│ Better   │                             │
│  │/api/ingest│◄─────────────────────│ Auth API │  returns orgId              │
│  └──────────┘                      └──────────┘                             │
│       │                                                                      │
│       │ 5. call DO directly                                                  │
│       ▼                                                                      │
│  ┌─────────────┐                                                            │
│  │ LinkProcessor│  commits linkCreated                                      │
│  │     DO       │  processes link                                           │
│  └─────────────┘                                                            │
│       │                                                                      │
│       │ 6. return success                                                    │
│       ▼                                                                      │
│  ┌──────────┐                                                               │
│  │ Raycast  │  shows toast: "Link saved!"                                   │
│  └──────────┘                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Comparison with Telegram Bot

| Aspect          | Telegram Bot             | Raycast Extension                  |
| --------------- | ------------------------ | ---------------------------------- |
| API Key Storage | KV (chatId → apiKey)     | Raycast Preferences (Keychain)     |
| Setup           | `/connect <key>` in chat | Paste key in extension preferences |
| Save Link       | Send message with URL    | Paste URL → select command         |
| Feedback        | Emoji reactions          | Toast notifications                |
| Platform        | Any (Telegram client)    | macOS only                         |

---

## Command Definition

The extension uses a **text argument** to receive the pasted URL:

```json
{
  "commands": [
    {
      "name": "save-link",
      "title": "Save to Cloudstash",
      "description": "Save a URL to Cloudstash",
      "mode": "no-view",
      "arguments": [
        {
          "name": "url",
          "type": "text",
          "placeholder": "URL",
          "required": true
        }
      ]
    }
  ]
}
```

When user pastes a URL in Raycast, this command appears because the argument accepts text input. Selecting it passes the URL to the extension.

---

## Extension Manifest

```json
{
  "name": "cloudstash",
  "title": "Cloudstash",
  "description": "Save links to Cloudstash",
  "icon": "extension-icon.png",
  "author": "cloudstash",
  "categories": ["Productivity", "Web"],
  "license": "MIT",
  "commands": [
    {
      "name": "save-link",
      "title": "Save to Cloudstash",
      "description": "Save a URL to Cloudstash",
      "mode": "no-view",
      "arguments": [
        {
          "name": "url",
          "type": "text",
          "placeholder": "URL",
          "required": true
        }
      ],
      "keywords": ["save", "link", "url", "bookmark"]
    }
  ],
  "preferences": [
    {
      "name": "apiKey",
      "title": "API Key",
      "description": "Your Cloudstash API key. Generate one in Settings → API Keys.",
      "type": "password",
      "required": true
    },
    {
      "name": "serverUrl",
      "title": "Server URL",
      "description": "Cloudstash server URL",
      "type": "textfield",
      "default": "https://cloudstash.dev",
      "required": true
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.89.0"
  },
  "devDependencies": {
    "@raycast/eslint-config": "^1.0.11",
    "@types/node": "22.14.0",
    "@types/react": "19.0.8",
    "typescript": "^5.8.2"
  }
}
```

---

## API Endpoint

The extension calls the existing `/api/ingest` endpoint. No new API needed.

### Request

```http
POST /api/ingest
Authorization: Bearer <api-key>
Content-Type: application/json

{
  "url": "https://example.com/article"
}
```

### Response

```json
{
  "status": "ingested" | "duplicate",
  "linkId": "uuid"
}
```

### Errors

| Status | Code              | Meaning                    |
| ------ | ----------------- | -------------------------- |
| 401    | `INVALID_API_KEY` | API key invalid or revoked |
| 400    | `INVALID_URL`     | URL format invalid         |
| 429    | `RATE_LIMIT`      | Too many requests          |

---

## Implementation

### Project Structure

```
raycast-extension/
├── package.json
├── src/
│   └── save-link.tsx       # Single command
├── assets/
│   └── extension-icon.png
└── README.md
```

### Core Logic

```typescript
// src/save-link.tsx
import {
  showHUD,
  getPreferenceValues,
  openExtensionPreferences,
  LaunchProps,
} from "@raycast/api";

interface Preferences {
  apiKey: string;
  serverUrl: string;
}

interface Arguments {
  url: string;
}

export default async function SaveLink(
  props: LaunchProps<{ arguments: Arguments }>
) {
  const { url } = props.arguments;
  const { apiKey, serverUrl } = getPreferenceValues<Preferences>();

  // Validate URL
  try {
    new URL(url);
  } catch {
    await showHUD("❌ Invalid URL");
    return;
  }

  // Save link
  try {
    const response = await fetch(`${serverUrl}/api/ingest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (response.status === 401) {
        await showHUD("❌ Invalid API key");
        await openExtensionPreferences();
        return;
      }
      throw new Error(error.message || "Failed to save");
    }

    const result = await response.json();

    if (result.status === "duplicate") {
      await showHUD("⚠️ Already saved");
    } else {
      await showHUD("✓ Link saved!");
    }
  } catch (error) {
    await showHUD(`❌ ${error.message}`);
  }
}
```

**~50 lines of code total.** Single file, no dependencies beyond `@raycast/api`.

---

## Distribution Options

### 1. Raycast Store (Public)

- Submit to official store
- Requires review process
- Users can install directly from Raycast

### 2. Private/Team Distribution

- Share extension folder
- Users run `npm install && npm run dev` to install locally
- No store listing needed

### 3. Quicklink Alternative (Simplest)

If a full extension is overkill, users can create a Raycast Quicklink:

```
URL: https://cloudstash.dev/api/ingest?url={clipboard}
Name: Save to Cloudstash
```

However, this won't work with API key auth (no way to add headers), so we'd need to support query param auth or a signed URL approach.

---

## Security Considerations

1. **API Key Storage**: Raycast stores password-type preferences in macOS Keychain
2. **HTTPS Only**: All API calls use HTTPS
3. **No Key in URL**: API key passed via Authorization header, not query params
4. **Rate Limiting**: Server-side rate limiting per API key

---

## Installation

Users install from Raycast Store:

1. Open Raycast → Store → search "Cloudstash"
2. Install
3. First use prompts for API key (stored in Keychain)

---

## Implementation Phases

### Phase 1: MVP

- [ ] Save Link command with URL argument
- [ ] API key preference
- [ ] HUD feedback (saved / duplicate / error)

### Phase 2: Polish

- [ ] Extension icon
- [ ] Better error messages
- [ ] Submit to Raycast Store

### Phase 3: Optional Enhancements

- [ ] Hotkey command (clipboard-based, no UI)
- [ ] Recent Links view
- [ ] Offline queue

---

## Open Questions

1. **Server URL** - What's the production URL to use as default?
2. **Store submission** - Raycast Store requires open source. OK to publish extension code publicly?

---

## References

- [Raycast API Documentation](https://developers.raycast.com)
- [Raycast Manifest](https://developers.raycast.com/information/manifest)
- [Raycast Extensions Repository](https://github.com/raycast/extensions)
- [Telegram Bot Integration](../telegram-bot.md) (similar pattern)
