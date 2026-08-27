# Use Effect HTTP client inside Effect programs

Status: accepted

## Context

Calling global `fetch` from an Effect program hides HTTP transport, cancellation,
and test control behind ambient state. The codebase already uses Effect v4's
fetch-backed HTTP client for OAuth and runs on Web Fetch-compatible Cloudflare
Workers.

## Evidence and Argument

The `globalFetchInEffect` diagnostic found four calls across analytics queries,
X syndication enrichment, and the X API client. All three integrations already
modeled transport and response failures as Effects. Replacing only their
transport boundary required no new dependency and allowed tests to inject
`FetchHttpClient.Fetch` instead of mutating `globalThis.fetch`. Running the
affected files together exposed existing cross-file interference from those
global stubs; service injection removed it.

## Options

| Option                                 | Tradeoffs                                                          |
| -------------------------------------- | ------------------------------------------------------------------ |
| Use `FetchHttpClient` and enforce rule | Typed, interruptible HTTP with isolated tests and existing deps    |
| Keep global fetch and disable rule     | Smallest diff, but retains ambient transport and global test state |
| Add a custom fetch service             | Stable local API, but duplicates the Effect HTTP abstraction       |

## Decision

Use `HttpClient` within Effect operations and provide `FetchHttpClient.layer`
at each live adapter or execution boundary. Tests override the built-in
`FetchHttpClient.Fetch` reference. Promote `globalFetchInEffect` to warning
severity after reaching a zero-warning baseline.

Effect's response abstraction intentionally omits the legacy HTTP
`statusText`. X API errors preserve their tag and numeric status while using a
stable `HTTP <status>` message for non-success responses.

## Consequences

- HTTP requests participate in Effect interruption, tracing, and typed failure
  handling.
- Tests no longer share mutable global fetch stubs across files.
- Live adapters remain self-contained and require no app-wide HTTP service
  plumbing.
- New global fetch calls inside Effect fail the strict diagnostic lane.
