---
target: MCP Integrations card
total_score: 20
p0_count: 0
p1_count: 3
timestamp: 2026-08-18T20-14-23Z
slug: src-components-integrations-mcp-card-tsx
---

Method: dual-agent (A: impeccable_design_a · B: impeccable_detector_b)

## Design Health Score

| #         | Heuristic                       |     Score | Key issue                                                                                                     |
| --------- | ------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     |         2 | Availability states exist, but copied feedback is weak and there is no server-known connected state.          |
| 2         | Match System / Real World       |         2 | The value proposition is clear; DCR, protocol dates, and raw scopes are not user language.                    |
| 3         | User Control and Freedom        |         2 | The card cannot truthfully manage client-held tokens or show which clients remain connected.                  |
| 4         | Consistency and Standards       |         3 | It uses the shared card system, but is much denser than neighboring integrations.                             |
| 5         | Error Prevention                |         2 | The exact URL helps; clipboard failure is silent and compatibility guidance is buried.                        |
| 6         | Recognition Rather Than Recall  |         2 | The URL is visible, but the icon-only primary action and unexplained client compatibility add interpretation. |
| 7         | Flexibility and Efficiency      |         2 | One-click copy is efficient; expert details are not separated from the normal path.                           |
| 8         | Aesthetic and Minimalist Design |         2 | Five protocol rows compete with the single setup action.                                                      |
| 9         | Error Recovery                  |         1 | Availability and clipboard failures have weak or no recovery.                                                 |
| 10        | Help and Documentation          |         2 | Setup copy exists, but troubleshooting and the local-only caveat are not shaped clearly.                      |
| **Total** |                                 | **20/40** | **Acceptable foundation; significant UX shaping needed.**                                                     |

## Anti-Patterns Verdict

**LLM assessment:** Pass, with one mild AI-slop tell. The restrained palette, compact typography, shared controls, and privacy-conscious copy fit Cloudstash. The tell is the generic stack of identical cards combined with an MCP card that reads like protocol documentation pasted into a settings panel.

**Deterministic scan:** Clean. `detect.mjs --json src/components/integrations/mcp-card.tsx` returned `[]` with exit code 0. No rules or file locations were reported, and there were no false positives to classify. This confirms the absence of detectable markup anti-patterns, not the strength of the information architecture.

**Visual overlays:** No reliable overlay is available. The browser runtime reported `No browser is available`, so mutable injection and browser-console evidence could not be attempted. The fallback evidence was source inspection, neighboring-card comparison, design-token inspection, a clean detector scan, and successful localhost HTTP readiness.

## Overall Impression

The card is technically careful but shaped around implementation facts instead of the user’s connection journey. The biggest opportunity is to make the default state a confident three-step handoff—copy URL, add it to a client, approve a workspace—while moving protocol and scope details behind disclosure.

## What’s Working

1. Availability distinguishes loading, backend failure, admin-disabled, upgrade, and available states instead of turning every failure into a paywall.
2. The endpoint is derived from the current origin and handles narrow layouts with a monospace, wrapping presentation.
3. “The workspace you approve” establishes a calm, privacy-conscious trust boundary without security theatre.

## Priority Issues

### P1 — The primary path is buried under protocol plumbing

**Why it matters:** Most compatible clients need one URL, yet every user must parse DCR, protocol versions, transport, and raw scopes.

**Fix:** Present a numbered three-step connection path. Move transport, registration, protocol fallback, and scopes into an “Advanced connection details” disclosure, with copy explaining that compatible clients configure these automatically.

**Suggested command:** `$impeccable distill`

### P1 — Copy feedback is too fragile for the primary action

**Why it matters:** The icon-only control is a small touch target, copied state is mainly an icon/color swap, and clipboard failure appears inert.

**Fix:** Use a visible “Copy URL” label, a minimum 44px touch target, a polite live announcement, and actionable failure text that leaves the URL selectable.

**Suggested command:** `$impeccable harden`

### P1 — The card implies connection management that Cloudstash cannot prove

**Why it matters:** OAuth clients hold access and refresh tokens, while the server does not have a reliable live “connected” state. A fake badge or revoke action would create false trust.

**Fix:** Label the current state “Ready to connect,” explain that access is granted per client and workspace, and state that client-held connections are removed in that MCP client. Do not fabricate a connected state.

**Suggested command:** `$impeccable clarify`

### P2 — Recovery and local-development help are visually weak

**Why it matters:** “Refresh” and ordinary muted text make failures and origin requirements easy to miss at the exact point users need help.

**Fix:** Add an inline Retry action for availability and separate localhost guidance into a compact callout inside advanced details.

**Suggested command:** `$impeccable polish`

### P2 — Semantic and loading details need accessibility polish

**Why it matters:** The MCP title is not a heading, loading is not announced, and pulsing skeletons do not opt out for reduced motion.

**Fix:** Add a semantic heading, `aria-busy`/status text, reduced-motion styling, and keyboard-visible disclosure behavior through the shared primitive.

**Suggested command:** `$impeccable audit`

## Persona Red Flags

**Alex (power user):** The only actionable value is surrounded by five always-expanded protocol facts; there is no compact expert disclosure or complete configuration view.

**Jordan (first-timer):** “MCP,” DCR, dated protocol versions, and raw scopes appear mandatory to understand. “Compatible clients” provides no reassurance that automatic setup is expected.

**Sam (accessibility-dependent):** The title lacks heading semantics, skeleton loading is not announced, the copy target is small, and copied state may not be announced by assistive technology.

## Minor Observations

- The generic network icon is adequate but gives MCP little recognizability.
- The card is materially taller and denser than neighboring integrations.
- “Scope override” sounds mandatory; “Requested OAuth scopes” is clearer.
- The localhost `BETTER_AUTH_URL` note should be developer-only advanced help, not ordinary body copy.

## Questions to Consider

- If a compatible client only needs one URL, why should protocol metadata dominate the default state?
- Is this an integration-management surface or embedded documentation?
- What is the truthful success state when the MCP client—not Cloudstash—owns the stored tokens?
- Would users trust the flow more if it foregrounded read, save, chosen workspace, and approval rather than protocol vocabulary?

Questions skipped: the user explicitly requested critique followed immediately by polish, and the two assessments converged on the same scoped changes.
