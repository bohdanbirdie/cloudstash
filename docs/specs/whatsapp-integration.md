# WhatsApp Integration Spec

**Status:** Planned

## Overview

Add WhatsApp as a messaging channel for saving links, following the same architecture as the existing Telegram integration. Users can send URLs via WhatsApp to save them to their workspace.

## Goals

1. Allow users to connect their WhatsApp account to cloudstash
2. Save links sent via WhatsApp messages
3. Provide feedback on ingestion status (saved, duplicate, failed)
4. Mirror the Telegram bot UX as closely as possible

## WhatsApp Business API Overview

### API Choice: Cloud API (Official)

Using **Meta's WhatsApp Cloud API** (not on-premise BSP):

| Aspect  | Cloud API                                                     |
| ------- | ------------------------------------------------------------- |
| Hosting | Meta-hosted                                                   |
| Setup   | Meta Developer App + Business Account                         |
| Library | Official `whatsapp` npm package                               |
| Webhook | HTTPS endpoint with verification                              |
| Cost    | Per-message pricing (free for service messages in 24h window) |

**Why Cloud API:**

- Official support, no risk of being blocked
- No server infrastructure to manage
- Free tier for customer-initiated conversations
- Same webhook pattern as Telegram

### Requirements

1. **Meta Business Account** - Required for WhatsApp Business API access
2. **Meta Developer App** - Create an "Enterprise" app with WhatsApp product
3. **Phone Number** - Meta provides a test number, or bring your own
4. **Webhook Endpoint** - HTTPS with SSL certificate

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  WhatsApp User                                                   │
│  Sends message: "https://example.com/article"                   │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼ Meta servers
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/whatsapp (webhook)                                    │
│  Headers: X-Hub-Signature-256                                    │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Worker: handleWhatsAppWebhook()                                │
│  1. Verify signature (HMAC-SHA256)                              │
│  2. Parse message, extract URLs                                 │
│  3. Look up user by phone number (WHATSAPP_KV)                  │
│  4. Verify API key via Better Auth                              │
│  5. Call LINK_PROCESSOR_DO to ingest                            │
│  6. Send reply via Graph API                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Comparison with Telegram

| Feature              | Telegram                  | WhatsApp                               |
| -------------------- | ------------------------- | -------------------------------------- |
| Bot framework        | grammY                    | Official SDK (`whatsapp` npm)          |
| Webhook verification | Secret token header       | HMAC-SHA256 signature                  |
| User identifier      | `chatId` (number)         | Phone number (string)                  |
| Commands             | `/connect`, `/disconnect` | Same (parsed manually)                 |
| URL detection        | Entity types in message   | Regex extraction                       |
| Reactions            | Native reactions API      | Reply with emoji (no native reactions) |
| Message types        | Text, entities            | Text, interactive buttons              |

## Implementation Plan

### Files to Create

| File                                           | Purpose                                       |
| ---------------------------------------------- | --------------------------------------------- |
| `src/cf-worker/whatsapp/index.ts`              | Exports and webhook handler                   |
| `src/cf-worker/whatsapp/handlers.ts`           | Message handlers (connect, disconnect, links) |
| `src/cf-worker/whatsapp/errors.ts`             | Typed errors                                  |
| `src/cf-worker/whatsapp/client.ts`             | WhatsApp API client wrapper                   |
| `src/cf-worker/whatsapp/verification.ts`       | Webhook signature verification                |
| `src/components/integrations/whatsapp-tab.tsx` | UI for WhatsApp setup                         |
| `scripts/whatsapp-tunnel.ts`                   | Local development tunnel                      |

### Environment Variables

```typescript
// src/cf-worker/shared.ts additions
interface Env {
  // ... existing

  // WhatsApp Cloud API
  WHATSAPP_PHONE_NUMBER_ID: string; // From Meta Developer Dashboard
  WHATSAPP_ACCESS_TOKEN: string; // Permanent access token
  WHATSAPP_VERIFY_TOKEN: string; // Webhook verification token (you choose)
  WHATSAPP_APP_SECRET: string; // For signature verification
  WHATSAPP_KV: KVNamespace; // Phone → API key mapping
}
```

### Wrangler Config

```toml
# wrangler.toml additions
[[kv_namespaces]]
binding = "WHATSAPP_KV"
id = "..." # Create with: wrangler kv:namespace create WHATSAPP_KV
```

## Webhook Implementation

### Verification Endpoint (GET)

Meta verifies the webhook URL by sending a GET request with challenge:

```typescript
// src/cf-worker/whatsapp/verification.ts
export function handleVerification(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}
```

### Message Webhook (POST)

```typescript
// src/cf-worker/whatsapp/index.ts
import { createHmac } from "node:crypto";

export async function handleWhatsAppWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // GET = verification, POST = messages
  if (request.method === "GET") {
    return handleVerification(request, env);
  }

  // Verify signature
  const signature = request.headers.get("X-Hub-Signature-256");
  const body = await request.text();

  if (!verifySignature(body, signature, env.WHATSAPP_APP_SECRET)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const payload = JSON.parse(body);
  await processWebhookPayload(payload, env);

  // Always return 200 quickly to acknowledge receipt
  return new Response("OK", { status: 200 });
}

function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return signature === expected;
}
```

### Webhook Payload Structure

```typescript
// Incoming message payload from Meta
interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: "whatsapp";
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string; // User's phone number
        }>;
        messages?: Array<{
          from: string; // User's phone number
          id: string;
          timestamp: string;
          type: "text" | "image" | "document" | "interactive";
          text?: { body: string };
        }>;
        statuses?: Array<{
          id: string;
          status: "sent" | "delivered" | "read" | "failed";
        }>;
      };
      field: "messages";
    }>;
  }>;
}
```

## Message Handlers

### Command Parsing

Unlike Telegram, WhatsApp doesn't have native bot commands. Parse manually:

```typescript
// src/cf-worker/whatsapp/handlers.ts
const COMMAND_REGEX = /^\/(\w+)(?:\s+(.*))?$/;

export function parseCommand(
  text: string
): { command: string; args: string } | null {
  const match = text.match(COMMAND_REGEX);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2]?.trim() || "" };
}

export async function handleMessage(
  message: WhatsAppMessage,
  env: Env
): Promise<void> {
  const text = message.text?.body;
  if (!text) return;

  const command = parseCommand(text);

  if (command) {
    switch (command.command) {
      case "connect":
        return handleConnect(message.from, command.args, env);
      case "disconnect":
        return handleDisconnect(message.from, env);
      case "start":
      case "help":
        return sendHelpMessage(message.from, env);
    }
  }

  // Not a command - check for URLs
  const urls = extractUrls(text);
  if (urls.length > 0) {
    return handleLinks(message.from, urls, env);
  }
}
```

### URL Extraction

```typescript
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : []; // Dedupe
}
```

### Sending Messages

```typescript
// src/cf-worker/whatsapp/client.ts
const GRAPH_API_VERSION = "v21.0";

export async function sendTextMessage(
  to: string,
  text: string,
  env: Env
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

// Alternative: Send with quick reply buttons
export async function sendInteractiveMessage(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>,
  env: Env
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    }),
  });
}
```

## User Flow

### Connect Flow

```
User: /connect abc123-api-key
Bot:  ✅ Connected! Send me any link to save it.

-- or if invalid --

Bot:  ❌ Invalid or expired API key. Generate a new one at cloudstash.dev/settings
```

### Save Link Flow

```
User: Check out this article https://example.com/cool-stuff
Bot:  ✅ Saved! (1 link)

-- or if duplicate --

Bot:  ⚠️ Already saved: https://example.com/cool-stuff

-- or if not connected --

Bot:  Please connect first: /connect <api-key>
      Get your API key at cloudstash.dev/settings
```

### Help Message

```
User: /help
Bot:  📎 CloudStash WhatsApp Bot

      Send me links to save them to your workspace.

      Commands:
      /connect <api-key> - Connect your account
      /disconnect - Disconnect your account
      /help - Show this message

      Get your API key at cloudstash.dev/settings
```

## Feedback Alternatives (No Reactions)

WhatsApp doesn't support message reactions like Telegram. Alternatives:

1. **Emoji in reply text**: "✅ Saved!" / "❌ Failed"
2. **Quick reply buttons**: Offer undo or view actions
3. **Read receipts**: Mark as read when processed (automatic)

Recommendation: Use emoji prefixes in reply messages for visual feedback.

## Pricing Considerations

### Free Tier (Service Conversations)

When a user messages first, a **24-hour customer service window** opens. During this window:

- All replies are **free**
- No template approval needed

This covers our use case perfectly since users initiate by sending links.

### Paid Messages (If We Need to Initiate)

If we ever need to message users first (notifications, etc.):

- Requires **pre-approved message templates**
- Costs ~$0.005-0.08 per message (varies by country)
- Marketing messages blocked to US numbers (as of April 2025)

### Recommendation

Start with **reactive-only** (respond to user messages). This is:

- Free
- No template approval needed
- Matches current Telegram behavior

## Security

### Webhook Signature Verification

Always verify `X-Hub-Signature-256` header using HMAC-SHA256 with app secret.

### Rate Limiting

- WhatsApp has built-in rate limits (varies by tier)
- Add our own rate limiting per phone number if needed
- Store attempt counts in KV with TTL

### Phone Number Storage

Store hashed phone numbers in KV for privacy:

```typescript
const key = `whatsapp:${hashPhoneNumber(phoneNumber)}`;
```

Or use reversible encryption if we need to display connected number in UI.

## UI Component

```tsx
// src/components/integrations/whatsapp-tab.tsx
export function WhatsAppTab() {
  const { apiKey, generateKey, isGenerating } = useApiKey();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <WhatsAppIcon className="h-5 w-5 text-green-500" />
        <h3 className="font-medium">WhatsApp</h3>
      </div>

      <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
        <li>
          Save our number: <strong>+1 XXX-XXX-XXXX</strong>
        </li>
        <li>Send this message to connect:</li>
      </ol>

      {apiKey ? (
        <div className="bg-muted p-3 rounded-md font-mono text-sm">
          /connect {apiKey}
        </div>
      ) : (
        <Button onClick={generateKey} disabled={isGenerating}>
          Generate API Key
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        After connecting, send any URL to save it to your workspace.
      </p>
    </div>
  );
}
```

## Local Development

### Tunnel Script

```typescript
// scripts/whatsapp-tunnel.ts
import { spawn } from "child_process";
import { parseEnvFile } from "./utils";

const env = parseEnvFile(".dev.vars");

// Start cloudflared tunnel
const tunnel = spawn("cloudflared", [
  "tunnel",
  "--url",
  "http://localhost:3000",
]);

tunnel.stdout.on("data", (data) => {
  const output = data.toString();
  // Look for tunnel URL
  const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match) {
    console.log(`\n🔗 Tunnel URL: ${match[0]}`);
    console.log(`📱 Configure webhook in Meta Developer Dashboard:`);
    console.log(`   Callback URL: ${match[0]}/api/whatsapp`);
    console.log(`   Verify Token: ${env.WHATSAPP_VERIFY_TOKEN}`);
  }
  process.stdout.write(data);
});
```

### Testing with Meta Test Number

1. Go to Meta Developer Dashboard → WhatsApp → Getting Started
2. Use the provided test phone number
3. Add your personal number to allowed test recipients
4. Send test messages

## Migration Path from Telegram

Users with existing Telegram connections can also add WhatsApp:

- Same workspace, different channel
- KV stores are separate (`telegram:*` vs `whatsapp:*`)
- API keys work across both integrations

## Error Handling

```typescript
// src/cf-worker/whatsapp/errors.ts
import { Data } from "effect";

export class MissingPhoneError extends Data.TaggedError(
  "MissingPhoneError"
)<{}> {}
export class NotConnectedError extends Data.TaggedError(
  "NotConnectedError"
)<{}> {}
export class InvalidApiKeyError extends Data.TaggedError(
  "InvalidApiKeyError"
)<{}> {}
export class MissingOrgIdError extends Data.TaggedError(
  "MissingOrgIdError"
)<{}> {}
export class RateLimitError extends Data.TaggedError("RateLimitError")<{}> {}
export class WhatsAppApiError extends Data.TaggedError("WhatsAppApiError")<{
  message: string;
  code?: number;
}> {}
```

## Testing Checklist

- [ ] Webhook verification works (GET request)
- [ ] Signature validation rejects invalid requests
- [ ] `/connect` links phone to API key
- [ ] `/disconnect` removes the link
- [ ] URLs are detected and saved
- [ ] Duplicate URLs are reported
- [ ] Invalid API keys show error message
- [ ] Not connected state shows help
- [ ] Reply messages are sent correctly
- [ ] Local tunnel development works

## Future Enhancements

1. **Rich previews** - Send link preview cards using WhatsApp templates
2. **Interactive buttons** - "View in app" / "Delete" quick actions
3. **Bulk import** - Forward multiple messages to batch-save
4. **Status updates** - Notify when link processing completes (requires templates)
5. **Voice messages** - Transcribe and extract URLs from voice notes

## Dependencies

```bash
bun add whatsapp  # Official Meta WhatsApp SDK (optional, can use fetch)
```

Note: The official SDK is optional. For our simple use case, direct `fetch` calls to the Graph API may be simpler and have fewer dependencies.

## References

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhook Setup Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)
- [Official Node.js SDK](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)
- [Message Types Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages)
- [Pricing Information](https://business.whatsapp.com/products/platform-pricing)
