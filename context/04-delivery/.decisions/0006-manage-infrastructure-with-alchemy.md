# Manage Cloudflare infrastructure with Alchemy

Status: accepted

## Context

Production and staging were declared in one `wrangler.jsonc`. Named Wrangler
environments do not inherit bindings, so staging repeated the whole binding
inventory by hand and drifted: its Durable Object migration history diverged
from production, and its D1 and KV ids existed only in Cloudflare. Production
deployed through Workers Builds with remote migrations applied before the
artifact was certified (DELTA-020). Secrets and some variables were set by hand
in the dashboard.

## Evidence and Argument

- [Alchemy](https://alchemy.run) declares every resource, binding, secret, and
  domain in TypeScript, and the same program deploys any stage, so a binding is
  declared once.
- Its Vite resource builds the app and Worker in the deploy itself, and its D1
  resource applies migrations as part of that deploy.
- Its local mode runs Workers, Durable Objects, D1, KV, Queues, and Workflows in
  workerd, so local development needs no Wrangler configuration.
- It adopts existing resources by name and the Worker's Durable Object
  namespaces through Cloudflare's `exports` map, keeping their data.
- `RemovalPolicy.protect` makes any plan that would delete or replace a
  production resource fail before anything is applied. It does not cover a
  Durable Object class: removing a Durable Object binding from the Worker is a
  Worker update that deletes the class and its data, so a unit test pins every
  Durable Object binding and class name.

## Options

| Option                             | Tradeoffs                                                                                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `wrangler.jsonc` environments | Familiar and stable, but bindings are duplicated per environment and resource ids, secrets, and domains stay outside the repository.   |
| Alchemy for all infrastructure     | One typed declaration for every stage and local dev; it is a beta release, and Durable Objects cannot return to Wrangler's migrations. |

## Decision

Declare all Cloudflare infrastructure in `alchemy.run.ts` and remove the
Wrangler configuration. Production is the `prod` stage, uses the shared
Cloudflare state store, and adopts the existing Worker, D1 database, KV
namespaces, Queues, Workflow, and domain under protection. Other stages use
local state and generated names. GitHub Actions deploys production on pushes to
`main`. Staging and per-PR stages are designed separately on top of this
stack.
