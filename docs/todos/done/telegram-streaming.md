# Telegram streaming + bot config cleanup

Replaced emoji reaction status indicators (👀 → 🤔 → 👍/👎) with `sendMessageDraft` streaming (Bot API 9.3+).

## How it works

- `sendMessageDraft(chatId, messageId, text)` shows live-updating draft bubble
- Same `draft_id` = Telegram animates update natively (no flickering)
- Finalize with `sendMessage` — draft disappears, real message appears
- `draft_id` = original Telegram `messageId` from `sourceMeta`

## Flow

1. Handler: `sendMessageDraft(chatId, messageId, "Saving link...")`
2. DO: `sendMessageDraft(chatId, messageId, "Fetching metadata...")`
3. DO: `sendMessageDraft(chatId, messageId, "Generating summary...")`
4. DO: `sendMessage(chatId, "Saved! Summary: ...", { reply_parameters: { message_id } })`

One notification, one final message, smooth animated progress.

## Key gotchas

- Draft is a floating bubble, not a reply — only the final `sendMessage` can be a reply
- Don't mix `sendMessage` and `sendMessageDraft` in the same flow
- If processing fails mid-draft, must still finalize with `sendMessage` (error message)

## TODOs remaining

- [ ] Update BotFather bot description and about text
