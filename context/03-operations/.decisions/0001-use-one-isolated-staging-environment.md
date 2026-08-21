# Use one isolated persistent staging environment

Status: accepted

## Context

Critical Cloudstash behavior spans deployed Cloudflare Durable Objects, D1,
Queues, Workflows, WebSockets, OAuth providers, and static assets. Local
Miniflare evidence cannot prove every platform boundary, while production-only
verification makes stateful migration and recovery mistakes expensive.
Cloudflare Workers Builds can upload versions for ordinary pull-request
previews, but Cloudflare does not currently generate preview URLs for Workers
that implement Durable Objects.

## Evidence and Argument

- [`wrangler.jsonc`](../../../wrangler.jsonc) exports four Durable Object classes
  and binds D1, KV, Queues, a Workflow, Analytics Engine, and Workers AI.
- [Cloudflare's preview URL limitations](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/#limitations)
  exclude Workers implementing Durable Objects.
- [Cloudflare's Workers Builds environment setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#wrangler-environments)
  supports connecting multiple named-environment Workers to the same Git
  repository with environment-specific deploy commands.
- [Cloudflare Worker versions](https://developers.cloudflare.com/workers/versions-and-deployments/)
  capture one Worker's code and bindings but do not capture state in D1, KV, or
  Durable Objects. Dashboard deployment promotion therefore does not move a
  release between the separate staging and production Workers.
- Cloudflare Zone Version Management has its own environment promotion model,
  but it versions zone configuration, is Enterprise-only, and is not Worker
  artifact promotion.
- The maintainer normally has one active PR, so permanent per-PR infrastructure
  would add more resource and secret lifecycle work than it removes.

## Options

| Option                                                  | Tradeoffs                                                                                                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Continue bounded production verification                | No extra environment cost, but critical stateful behavior is first exercised against production data and quotas.                          |
| Use Workers Builds version previews for every PR        | Automatic branch workflow, but no usable preview URL exists for this Durable Object Worker and stateful bindings are not isolated per PR. |
| Provision a complete temporary environment for every PR | Strong isolation and parallelism, but requires dynamic D1/KV/Queue/Workflow/secrets/OAuth setup and cleanup.                              |
| Keep one isolated environment selected by `staging`     | Exercises real deployed boundaries with stable credentials and data; concurrent PRs must serialize or deliberately share a rehearsal.     |

## Decision

Define `env.staging` in the shared Wrangler configuration and deploy it as the
separate `cloudstash-staging` Worker from a long-lived `staging` branch. Give it
independent stateful resources, secrets, provider test configuration, and a
stable public origin. Promote one chosen PR head at a time; retain ordinary CI
for every PR and add more staging slots only if concurrent deployed verification
becomes common. After staging verification, promote the reviewed source change
by merging it to `main`; exact cross-Worker artifact promotion would require a
separate CI artifact handoff.
