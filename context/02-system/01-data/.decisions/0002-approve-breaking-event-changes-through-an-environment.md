# Approve breaking event changes through a GitHub Environment

Status: accepted

## Context

Deployed LiveStore events are append-only (`CS.SYS.DATA-R05`), and the LiveStore
contract fails a pull request that removes, renames, or reshapes one. A
deliberate break, such as a planned Effect or LiveStore upgrade that changes a
wire encoding, still needs a way through. Most pull requests are written by
agents, which work under the maintainer's account or the Capy GitHub App and
are told to make CI pass, so the override must be something only a person can
give, and it must not survive a later push.

## Evidence and Argument

- Against the contract on draft
  [PR #155](https://github.com/bohdanbirdie/cloudstash/pull/155), adding a
  required field to a deployed event and then editing the golden and one
  scenario line in the same pull request turned every check green, so any
  oracle or override stored in the pull request's tree can be edited the same
  way.
- The Capy GitHub App can set pull request labels, so a label is not a
  person's approval, and labels survive later pushes.
- Capy pull requests are often authored under the maintainer's account, and
  GitHub does not let an author approve their own pull request, so a required
  code-owner review would block the maintainer too.
- GitHub's Environment required reviewers are users or teams, up to six; a job
  that references the Environment waits until one of them approves that run.
  On GitHub Free they are available for public repositories, and this
  repository is public.
- Running a workflow that references a missing Environment creates it without
  protection rules, so the approval job would run at once. The gate therefore
  reads the run's approval history
  (`GET /repos/{owner}/{repo}/actions/runs/{run_id}/approvals`) and requires an
  approval by a user for `livestore-breaking-change`, so it fails closed until
  reviewers are configured.

## Options

| Option                                                   | Tradeoffs                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| In-repository allowlist file                             | Simple, but the pull request that breaks an event can edit it.                                                  |
| Pull request label                                       | Visible, but the Capy App can set it and it survives later pushes.                                              |
| CODEOWNERS with required code-owner review               | Strong, but blocks the maintainer on pull requests authored under his own account.                              |
| No override                                              | Clean for shapes, but leaves no path for a deliberate encoding change.                                          |
| `livestore-breaking-change` Environment approval per run | Only a listed person approves, and each push needs a new approval; needs one-time setup in repository settings. |

## Decision

A detected break runs the `Approve breaking LiveStore change` job, which uses
the `livestore-breaking-change` Environment with the maintainer as required
reviewer. The required `LiveStore contract` job passes a break only when that
job succeeded and the run's approval history records a user's approval for the
Environment. Prevent self-review stays off, because the maintainer is usually
the one who triggered the run. Anyone holding the maintainer's own credentials
can still approve, and a pull request runs its own copy of the workflow, so
edits to the workflow and the contract tooling are flagged in the run summary
and the gate is a required check.
