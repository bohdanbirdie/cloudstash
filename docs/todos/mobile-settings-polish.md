# Mobile settings polish

Three follow-ups from the mobile pass on the settings/account surface. See [[mobile-view-review]] for the broader audit.

## 1. Delete-account flow on mobile

Current "Delete account" lives in Settings → Account → Danger Zone with a type-DELETE confirmation. Walk it on a phone and fix what's awkward: confirmation dialog sizing, the type-to-confirm input, button layout, post-delete state. Likely needs the same `fullScreenOnMobile` treatment the other dialogs got, plus a tap-friendly confirmation pattern.

## 2. Connections tab — UX overhaul

The Connections section in Settings needs a rethink, not a polish. Today it mixes Telegram, Raycast, and API keys in one list with inconsistent affordances. Decide the IA (per-integration cards? grouped sections?), clarify the "connection" vs "API key" framing, and design each flow (connect, disconnect, regenerate, copy) to feel like one product. Coordinate with the standalone "Connections modal revamp" Todo — likely the same work.

## 3. Settings modal tabs on mobile

Phone width currently shows icon-only tabs (40×40 with `aria-label`) because the labels don't fit. It works but looks bare. Options:

- iOS-style drill-in (section list → push into section, back button to return). Most native, biggest restructure.
- Keep icons + add a small label below each (two-line tab) so identification doesn't rely on icon recognition alone.
- Replace the tab strip with a section header + "switch section" dropdown.

Pick one; ensure the active state still indicates which section you're in.
