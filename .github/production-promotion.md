This rolling PR promotes the current `staging` branch to production. It updates
automatically as more changes merge into `staging`.

Before merging:

- [ ] The latest `cloudstash-staging` deployment succeeded.
- [ ] The current staging revision completed the intended soak period.
- [ ] Authentication, browser sync, Queue ingestion, and changed critical paths
      were smoke-tested on `https://staging.cloudstash.dev`.
- [ ] Any production migration or provider impact was reviewed.

Merging this PR updates `main`; the existing production Workers Build then
deploys `cloudstash`.
