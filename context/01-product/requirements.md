# Product — Requirements

## Context

Defines the user-visible Cloudstash product that landing, plans, legal surfaces,
and the application must project. Those deployed surfaces are evidence and
outputs of this node, not independent sources of requirements.

## Assumptions

- **CS.PROD-A01 Capture precedes organization:** Users receive value from
  saving and retrieving before they invest in detailed tagging or curation.
  - Validation: the landing's “Paste a URL. Done.” positioning and optional-tag
    UI.
- **CS.PROD-A02 Summaries aid triage:** Concise summaries help a person decide
  what to read; they do not replace the source.
  - Validation: landing copy and the current two-to-three-sentence summary
    output contract.

## Constraints

- **CS.PROD-C01 Content rights:** Cloudstash stores links and derived context,
  not a redistributable full-page content mirror.
- **CS.PROD-C02 Plan truthfulness:** Price and availability claims must match
  Stripe configuration and server-enforced capabilities.

## Acceptable Tradeoffs

- **CS.PROD-T01 Optional organization:** AI suggestions may participate in
  search and filters before explicit acceptance, trading strict manual control
  for lower maintenance effort.
- **CS.PROD-T02 Eventual enrichment:** A saved item may temporarily show only
  its URL/domain and processing state.
- **CS.PROD-T03 Personal-first UX:** The interface optimizes for a personal
  library even though the tenancy model can represent members and invitations.

## Requirements

### Must Make Capture Frictionless

- **CS.PROD-R01 Common library:** Every supported capture surface must save into
  the selected workspace's same library. `refines: CS-R01`
- **CS.PROD-R02 Immediate local capture:** Web capture must be visible from
  local state without waiting for metadata or AI. `refines: CS-R02, CS-R04`
- **CS.PROD-R03 Source context:** A link retains source type and the minimum
  provider identity needed for idempotent confirmation/notification; full
  provider content is excluded unless another requirement explicitly owns it.
  `refines: CS-R21`

### Must Make Saved Material Useful

- **CS.PROD-R04 Preview:** The library displays every successfully extracted
  title, description, image, favicon, domain, and timestamp while allowing any
  unavailable optional field to be absent.
- **CS.PROD-R05 Reading lifecycle:** Users must be able to move links between
  unread and completed states and reversibly archive/restore them.
- **CS.PROD-R06 Retrieval:** Direct local search must retrieve by title, domain,
  description, summary, URL, and effective tags; the entitled workspace agent
  must be able to search and inspect the same library records.
- **CS.PROD-R07 AI triage:** When extraction and model generation succeed, an
  entitled workspace receives a two-to-three-sentence summary of at most 600
  characters and no more than the configured number of tag suggestions.
- **CS.PROD-R08 Failure clarity:** Unfetchable or failed links remain visible
  with a meaningful processing/failure state and may be reprocessed.

### Must Preserve Trust

- **CS.PROD-R09 Private and portable:** Product surfaces must disclose actual
  processors and tracking, state export scope exactly, prohibit model training
  on workspace content, and distinguish immediate access revocation from
  asynchronous purge. `refines: CS-R08, CS-R09, CS-R17, CS-R18, CS-R20`
- **CS.PROD-R10 Availability truth:** Landing, pricing, settings, and upgrade
  surfaces must distinguish shipped capability from roadmap direction.
- **CS.PROD-R11 Free saving core:** Free workspaces retain dashboard and Chrome
  capture, organization/search, device sync, and export without requiring a
  payment method.
- **CS.PROD-R12 Paid value:** Plus and Pro capabilities are additive bundles
  whose enforcement follows runtime capabilities rather than copy alone.
