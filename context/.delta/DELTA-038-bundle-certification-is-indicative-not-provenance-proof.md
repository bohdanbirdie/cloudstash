# DELTA-038: Bundle certification is indicative, not provenance proof

Status: open

## Divergence

Current bundle checks verify one known Effect v3 version string and distinct
React version strings. They do not detect every Effect v3 version or two
same-version React runtimes.

## Intent

[CS.DEL-R07](../04-delivery/requirements.md) requires critical runtime identity
certification.

## Implementation

[`verify-bundle.ts`](../../scripts/verify-bundle.ts) searches one Effect version
and distinct React version strings, so same-version duplicates can evade it.

## Direction

update implementation

## Resolution Signal

Delete this delta when runtime singleton checks derive from resolved module
inputs/metafile evidence, detect same-version duplicates, and negative fixtures
prove alternate Effect/React copies fail certification.
