# Restore frequent WebSocket ping + improve offline handling

Ping was found to be free on Cloudflare (no write amplification cost). Restore the original ping frequency and improve offline detection/reconnection handling.
