# DELTA-038: Bundle certification is indicative, not provenance proof

Status: open

## Divergence

Current bundle checks verify an application-injected vendored marker, one known
Effect v3 version string, and distinct React version strings. They do not prove
that all LiveStore runtime code came from the submodule, detect every Effect v3
version, or detect two same-version React runtimes.

## Intent

[CS.DEL-R07](../04-delivery/requirements.md) requires critical source/runtime
identity certification rather than only marker presence.

## Implementation

[`livestore-local.ts`](../../tools/livestore-local.ts) computes the marker from
vendored-directory presence. [`verify-bundle.ts`](../../scripts/verify-bundle.ts)
searches that literal, one Effect version, and distinct React version strings,
so alias regressions or same-version duplicates can evade it.

## Direction

update implementation

## Resolution Signal

Delete this delta when build provenance derives from resolved module inputs/
metafile evidence, runtime singleton checks detect same-version duplicates, and
negative fixtures prove published LiveStore or alternate Effect/React copies
fail certification.
