# Use the workspace ID as the content and stateful-object boundary

Status: accepted

## Context

Authentication calls the tenant an organization, LiveStore requires a
`storeId`, billing needs a subscription owner, and Durable Objects need stable
names. Independent identifiers would require mapping and create opportunities
for cross-tenant mistakes.

## Evidence and Argument

- D1 sessions carry `activeOrganizationId` and membership is organization-scoped.
- Browser, extension, link processor, and chat stores all use that ID as
  LiveStore `storeId`.
- `SyncBackendDO`, `LinkProcessorDO`, and `ChatAgentDO` are addressed by the
  workspace ID; billing and capability rows use the same organization ID.
- E2E tests use this alignment to inspect one workspace's persisted eventlog.

## Options

| Option                                                             | Tradeoffs                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Give each subsystem an independent tenant/store/object ID          | Allows future remapping, but adds lookup state and makes authorization mistakes easier.                              |
| Use user ID for all content boundaries                             | Simple for personal use, but conflicts with organization membership, workspace billing, and future shared ownership. |
| Reuse organization/workspace ID as `storeId` and workspace DO name | Couples the boundaries deliberately, but makes isolation and authorization mechanically aligned.                     |

## Decision

Use the organization ID as the workspace ID, LiveStore `storeId`, billing owner,
and name of workspace-scoped sync, processing, and chat objects. User-scoped
integrations such as X bookmark polling may use user ID but must enqueue into an
explicit authorized workspace.
