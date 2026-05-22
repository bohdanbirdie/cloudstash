export function isInDock(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLElement && e.target.closest("[cmdk-root]") !== null
  );
}
