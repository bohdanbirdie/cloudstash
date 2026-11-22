# Staging environment

Staging is retired. The old staging Worker (`cloudstash-staging`) was defined as
a Wrangler `env.staging` block, and that block was removed when infrastructure
moved to Alchemy (`alchemy.run.ts`). Staging will come back as an Alchemy stage
of the same stack.

The `staging` branch, the rolling `staging` to `main` promotion PR, and the old
`cloudstash-staging` Worker and its resources in Cloudflare still exist. Delete
the Cloudflare resources by hand when the new staging stage replaces them.
