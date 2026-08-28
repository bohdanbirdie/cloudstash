# Enforce Worker test seams and production type evidence

Status: accepted

## Context

Module-level mocks can make a Worker test exercise an invented dependency
contract instead of the installed library. The X enrichment tests replaced the
AI provider modules, while the chat tool tests replaced AI SDK helpers and used
a tool-part shape that no longer matched AI SDK 6. Production also retained
several `as unknown as` chains at Cloudflare, LiveStore, Hono, Agents SDK, and
React style boundaries even though the current dependency graph accepts those
values directly.

The upstream `dmmulroy/anti-slop` rules identify both patterns, but adopting its
entire young rule set would introduce a large syntactic warning baseline and a
new package dependency. Cloudstash only needs the rules whose present baseline
can be made truthful without exceptions or behavior rewrites.

## Evidence and Argument

The initial audit found three module mocks across two Worker test files and six
chained assertions in production. Replacing the tool-test mock immediately
showed that its fixture used obsolete `tool-invocation` and `result` fields
instead of AI SDK 6's public dynamic tool part. The enrichment generator already
had an Effect service boundary; accepting one narrow completion operation at
layer construction removed two provider mocks without adding another service.

Removing the five Cloudflare entry-point assertion chains and the React style
assertion chain left the typechecker and focused tests green. This proves those
chains were stale rather than required bridges. The wider anti-slop audit also
produced hundreds of syntactic findings, so installing and enabling the entire
package would not provide a truthful zero-baseline quality gate.

## Options

| Option                                      | Tradeoffs                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Vendor two focused rules and fix baseline   | Enforces demonstrated risks without a new package or exception list    |
| Install and enable all anti-slop rules      | Broad coverage, but a noisy baseline and unstable young dependency     |
| Keep rules advisory and retain current code | Smallest diff, but invented test contracts and double casts can return |

## Decision

Vendor the focused `no-module-mocking` and `no-chained-type-assertions` rule
logic into Cloudstash's existing local Oxlint plugin surface.

- Enforce module mocking as an error in Worker tests. UI tests remain outside
  this first boundary.
- Enforce chained type assertions as an error in production code. Tests remain
  outside the rule because partial Cloudflare fixtures intentionally omit most
  runtime surface area.
- Replace provider module mocks with a narrow Effect layer constructor that
  accepts the completion operation.
- Exercise AI SDK tool-part detection with the SDK's real public part shape and
  helpers.
- Remove boundary assertion chains when current public types are already
  assignable. Do not hide an unavoidable assertion inside an adapter merely to
  satisfy the rule.

## Consequences

Worker dependency replacement becomes visible in the production architecture,
which keeps tests aligned with actual composition. Installed-library contract
tests fail when their public runtime shape changes instead of continuing through
a hand-written mock. Production code cannot erase type evidence through a
double assertion. A future expansion to UI tests or stricter assertion rules
requires a separate zero-baseline review rather than accumulating exemptions.
