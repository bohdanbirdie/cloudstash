# Add Raycast ingestion path

Save links from anywhere on macOS via Raycast.

## What was built

- Two no-view commands: "Save to Cloudstash" (paste URL) and "Save Clipboard URL" (hotkey)
- OAuth-style connect flow — browser-based auth, zero manual API key setup
- Device hostname sent on connect for per-device key naming
- 401 auto-retry (link never lost), persistent Toast for errors
- Server endpoints: `POST /api/connect/raycast`, `POST /api/connect/raycast/exchange`
- Web UI: Raycast tab in Integrations modal with device count, key list, disconnect guidance
- 14 extension unit tests + 12 server connect unit tests with Effect DI

Extension at [bohdanbirdie/cloudstash-raycast](https://github.com/bohdanbirdie/cloudstash-raycast). Local clone at `local/raycast-extension/`.

See [[todos/publish-raycast-extension]] for Store publishing status.
