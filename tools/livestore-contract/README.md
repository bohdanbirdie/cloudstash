# LiveStore contract

Events are saved forever. Every user's history keeps the events it has, and
every device rebuilds its tables by replaying them, so an event that is
already deployed must keep loading and must keep doing the same thing. This
folder is how we check that.

## What is in it

- `scenarios/*.json`: short stories of events, written so people and agents
  can read them. Each step has an `event`, its `args` exactly as they travel
  over sync, and `expect`: the tables that step changed, with all their rows.
  You write `event` and `args`; `expect` is recorded for you.
- `schema.json`: generated. Every event with its sync scope and the shape of
  its fields, plus every table's columns. It catches what a scenario can't
  show, such as an event switching from synced to local-only.
- `main.ts` and `src/`: the tool.

## The command

```sh
bun run contract
```

1. Rewrites `schema.json` and records `expect` in every scenario from this
   code, so commit whatever it changes.
2. Fails if an event appears in no scenario, or if playing a scenario twice
   gives different tables.
3. Takes `schema.json` and the scenarios **from the base branch** (`git show`,
   `origin/staging` by default) and checks them against this code:
   - every base scenario plays with the same args and ends with the same
     tables at every step;
   - every base event still exists, keeps its scope, and keeps every field's
     shape. New events and new optional fields are fine.

Because step 3 reads the base branch, editing scenarios or `schema.json` in a
pull request does not change what it is checked against.

## When it fails

- **Your own scenario fails**: fix the code or the scenario's args.
- **A base scenario or event breaks**: you changed an event that is already
  deployed. Put it back and add a new version instead (`v1.TagRenamed` →
  `v2.TagRenamed`), keeping the old event and its materializer. If the break
  is deliberate, stop and ask the maintainer: in CI only a person can approve
  it, on the `livestore-breaking-change` environment.

## Native app

`apps/native` replays the same scenarios through its Rust materializers and
must write the same rows in the tables it keeps (`cargo test livestore::contract`
in `apps/native`). CI runs both sides in `.github/workflows/livestore-contract.yml`.
