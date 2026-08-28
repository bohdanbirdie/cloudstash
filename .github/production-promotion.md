This rolling PR promotes the current `staging` branch to production. It updates
automatically as more changes merge into `staging`.

Before merging:

- [ ] The latest `cloudstash-staging` deployment succeeded.
- [ ] The current staging revision completed the intended soak period.
- [ ] Authentication, browser sync, Queue ingestion, and changed critical paths
      were smoke-tested on `https://staging.cloudstash.dev`.
- [ ] Any production migration or provider impact was reviewed.

**Merge this PR with "Create a merge commit", not "Squash and merge".** Both
`staging` and `main` are long-lived. A squash puts a commit on `main` that git
cannot relate to the `staging` commits it replaced, so the two branches read as
divergent and the next promotion PR reports false conflicts. Squashing ordinary
feature PRs into `staging` stays fine — those branches end at the merge.

Merging this PR updates `main`; the existing production Workers Build then
deploys `cloudstash`.
