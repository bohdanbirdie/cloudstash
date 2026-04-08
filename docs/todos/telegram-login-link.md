# Simplify Telegram bot auth with login link

Replace manual `/connect <api-key>` with a browser-based connect flow, like Raycast.

## Flow

1. User sends `/connect` (no args)
2. Bot replies with link: `https://cloudstash.dev/connect/telegram?chatId=<chatId>`
3. User opens link, logs in, clicks "Connect Telegram"
4. Server creates API key + stores `chatId → apiKey` in KV
5. Bot confirms: "Connected!"

## References

- Raycast connect (same pattern): `src/cf-worker/connect/raycast.ts`, `src/routes/connect/raycast.tsx`
- Current Telegram auth: `src/cf-worker/telegram/handlers.ts` (`handleConnect`)
- KV store: `src/cf-worker/telegram/services/telegram-key-store.live.ts`
