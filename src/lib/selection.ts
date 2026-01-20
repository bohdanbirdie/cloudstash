export function toggleSelection(selectedIds: Set<string>, id: string): Set<string> {
  const next = new Set(selectedIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function selectRange(
  selectedIds: Set<string>,
  anchorIndex: number,
  targetIndex: number,
  allIds: readonly string[],
): Set<string> {
  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  const next = new Set(selectedIds)
  for (let i = start; i <= end; i++) {
    next.add(allIds[i])
  }
  return next
}

export function removeStaleIds(selectedIds: Set<string>, validIds: Set<string>): Set<string> {
  const next = new Set<string>()
  for (const id of selectedIds) {
    if (validIds.has(id)) next.add(id)
  }
  return next
}
