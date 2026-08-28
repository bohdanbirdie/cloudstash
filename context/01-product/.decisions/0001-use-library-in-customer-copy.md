# Use library as the customer-facing collection term

Status: accepted

## Context

Cloudstash exposes one personal collection of saved links. Public copy had begun
calling that collection a Vault while the application itself used Inbox, All,
Archive, and library. Workspace also appeared in billing and integration copy
even though customers cannot select or manage multiple workspaces.

## Evidence and Argument

- The authenticated product has no primary surface named Vault.
- The welcome flow and chat already use library, a familiar term for a complete
  collection.
- Inbox is a useful name for the active triage view, but not for completed and
  archived links.
- Workspace remains necessary for internal tenancy, billing, authorization,
  synchronization, and Durable Object identity.
- Legal and destructive copy is clearest when it says saved links or account
  data directly.

## Options

| Option                                                   | Tradeoff                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Productize Vault across navigation and onboarding        | Creates a distinctive noun, but adds explanation and renames surfaces without adding user value.  |
| Expose workspace as the collection term                  | Matches backend tenancy, but introduces a selection concept the product does not offer.           |
| Use library publicly and reserve workspace for internals | Uses familiar language and one mental model, while preserving precise implementation terminology. |

## Decision

Use **library** for the complete customer-visible collection and **Inbox** for
its active triage view. Use **saved links** or **account data** where literal
language is clearer, especially in legal, export, and deletion copy. Keep
**workspace** as the internal ownership and isolation boundary until customers
can actually select or manage multiple workspaces. Do not use Vault in current
product copy or Intent terminology.
