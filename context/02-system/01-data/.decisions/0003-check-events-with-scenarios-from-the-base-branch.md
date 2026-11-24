# Check deployed events with scenarios from the base branch

Status: accepted

## Context

A deployed event must keep loading and keep writing the same rows on every
client, or replicas that replay it diverge or stop. Before this, the web had
wire goldens and a single generated fixture that `apps/native` replayed, both
compared with the same pull request's code. An agent could change an event,
regenerate the fixture or edit the golden, and every check passed. LiveStore
rebuilds state only when tables change, so a changed materializer of a
deployed event is otherwise invisible.

## Evidence and Argument

- Adding a required field to a deployed event and editing its golden in the
  same pull request turned every old check green; so did deleting an event with
  its golden.
- Reading the expected results from the base branch with `git show` makes them
  something the pull request cannot edit, and the base's copies were checked
  when they merged.
- A scenario that lists, after each step, the rows each table holds is readable
  by a person and an agent, records materializer behaviour, and is the same
  input the Rust app replays.
- A scenario proves only the values it uses, so a generated snapshot of every
  event's scope and field shapes covers what a story cannot show.

## Options

| Option                                                 | Tradeoffs                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Fixtures compared with the same pull request's code    | Simple, but the pull request can edit its own oracle.                                          |
| Check out and run the base branch's generator          | Tamper-proof, but needs a second install and runs base code.                                   |
| Property-based or random events                        | Broad, but unreadable and nondeterministic; rejected by the maintainer.                        |
| Recorded scenarios and a schema snapshot from the base | Readable and tamper-proof without running base code; only proves the values scenarios contain. |

## Decision

`tools/livestore-contract` holds readable scenarios whose expected tables are
recorded by `bun run contract`, and a generated `schema.json`. The check
replays the base branch's scenarios and compares its snapshot with this code;
the Rust app replays the scenarios too. Every event must appear in a scenario.
A detected break needs a person's approval per
[decision 0002](./0002-approve-breaking-event-changes-through-an-environment.md).
