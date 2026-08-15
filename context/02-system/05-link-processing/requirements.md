# Link Processing — Requirements

## Context

Owns server-side enrichment after link creation: metadata, readable content,
summary, tag suggestions, processing state, reprocessing, and source
notifications.

## Assumptions

- **CS.SYS.PROC-A01 Fetch failure is expected:** Some URLs reject bots, require
  authentication, exceed size/time limits, or contain no readable article.
  - Validation: extractor/failure code and production todos.
- **CS.SYS.PROC-A02 AI output is untrusted:** Model output may be malformed,
  empty, injected by page text, slow, or unavailable.
  - Validation: schema-constrained tool calling, sanitization, and typed errors.

## Constraints

- **CS.SYS.PROC-C01 Runtime bounds:** Metadata/content requests and AI calls run
  within Worker/DO memory, body-size, subrequest, and execution limits.
- **CS.SYS.PROC-C02 Provider data handling:** Fetched content sent to AI must
  follow current privacy/provider disclosures.

## Acceptable Tradeoffs

- **CS.SYS.PROC-T01 Partial enrichment:** Metadata may succeed when summary
  fails; an empty metadata result may still progress according to typed outcome.
- **CS.SYS.PROC-T02 Latest snapshot:** Reprocessing appends new metadata and
  summary records rather than mutating historical observations.
- **CS.SYS.PROC-T03 Suggestion participation:** Pending AI tags can affect search
  and filters before explicit user acceptance.

## Requirements

- **CS.SYS.PROC-R01 Reactive work discovery:** Processing derives from current
  links and processing status, not a process-memory-only task list.
  `refines: CS.SYS-R05`
- **CS.SYS.PROC-R02 Bounded concurrency:** Metadata/content and AI work must use
  independent concurrency limits so slow AI does not monopolize fetch capacity.
  `refines: CS-R10`
- **CS.SYS.PROC-R03 Single submission:** A link may be submitted at most once to
  the in-memory pipeline at a time; persistent state remains the recovery truth.
- **CS.SYS.PROC-R04 Explicit lifecycle events:** Start, completion, failure,
  cancellation, and reprocess request are workspace events.
- **CS.SYS.PROC-R05 Metadata fallback:** Metadata extraction must try the
  matching host extractor and, unless it is authoritative, merge missing title,
  description, image, and favicon fields from generic HTML metadata.
- **CS.SYS.PROC-R06 Safe content fetch:** Content extraction accepts only
  HTTP(S), validates every redirect hop, caps redirects/body size/time, and does
  not persist full content. `refines: CS.SYS.DATA-R10`
- **CS.SYS.PROC-R07 Structured AI output:** Summaries and tags must pass a schema;
  raw or malformed model text must never be stored as a summary.
- **CS.SYS.PROC-R08 Prompt-content boundary:** Page content is data, not
  instructions; known prompt-boundary tokens are neutralized and the system
  prompt forbids following content instructions.
- **CS.SYS.PROC-R09 Capability gate:** Summary generation and X enrichment use
  current workspace capabilities; inability to read capabilities fails down to
  the free surface.
- **CS.SYS.PROC-R10 Reuse tags:** Suggestion output accepts at most two existing
  tag names and one new tag, validates/sanitizes names, fuzzy-reuses existing
  names, and never suggests a tag already effective on the link.
- **CS.SYS.PROC-R11 Failure persistence:** Expected fetch/parse/timeout/AI
  failures must commit a user-visible typed processing failure rather than kill
  the store silently.
- **CS.SYS.PROC-R12 Reprocess parity:** Reprocessing enters through a workspace
  event and the same processor path rather than a racing direct API side path.
- **CS.SYS.PROC-R13 Source notification:** Source-specific confirmation is driven
  by persisted terminal status and protected from duplicate notification.
- **CS.SYS.PROC-R14 Stale recovery:** Once per processor lifetime, boot must
  cancel non-terminal links older than the configured stale threshold and emit
  the source-specific recovery prompt where that source supports one.
