export function isInTagStrip(e: KeyboardEvent): boolean {
  return (
    e.target instanceof HTMLElement &&
    e.target.closest("[data-tag-strip]") !== null
  );
}
