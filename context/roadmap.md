# Cloudstash — Roadmap

Non-normative directions. These do not constrain implementation until their
trigger occurs and they are promoted into the named target. Active task status
belongs in `docs/kanban.md` and `docs/todos/`.

| Direction                         | Why it may matter                                                          | Promotion trigger                                                                       | Target                                                |
| --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Multiple chat threads             | Named conversations should not duplicate the workspace data owner.         | Product ownership semantics and storage topology resolve [CS-DQ4](./open-questions.md). | Retrieval/agent node and account-lifecycle inventory. |
| Link notes                        | User-authored context could improve retrieval and chat.                    | Product schema and export/privacy behavior are approved.                                | Product, data, retrieval, and export requirements.    |
| Explicit initial-sync readiness   | Large/fresh replicas can render misleading partial state.                  | UX choice plus measured readiness signal resolve [CS-DQ3](./open-questions.md).         | Product and sync requirements/specs.                  |
| CLI capture client                | A CLI can reduce capture friction without changing ingest semantics.       | A maintained client artifact, owner, distribution path, and auth design exist.          | Product and integration specs.                        |
| X recent-window import            | Some users may value an optional bounded initial import.                   | Provider cost/policy is revalidated and explicit consent/backlog UX is designed.        | Integration requirement/decision.                     |
| Pro summary-model differentiation | A higher-quality model could make the Pro summary experience distinct.     | Quality, latency, cost, fallback, and entitlement behavior are validated.               | Product, processing, and billing specs.               |
| Operational alerting              | Existing log tripwires do not notify an owner.                             | Alert destination, owner, thresholds, and recovery procedures are selected.             | Operations requirements/spec/reference.               |
| Dependency boundaries             | One Worker may approach deployment limits or become operationally coupled. | Certified compressed size or failure-domain evidence crosses an agreed threshold.       | Delivery/operations decision.                         |
