import { Match } from "effect";
import { useEffect, useRef, useState } from "react";

import { isKeyboardMode } from "@/lib/input-mode";

const NAV_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

interface RovingArgs {
  itemIds: string[];
  activeId: string | null;
  activeOverflowId: string | null;
}

export function useRovingTagFocus({
  itemIds,
  activeId,
  activeOverflowId,
}: RovingArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rovingId, setRovingId] = useState<string | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const prevOverflowIdRef = useRef<string | null>(null);

  const defaultTabbable =
    activeId && itemIds.includes(activeId) ? activeId : (itemIds[0] ?? null);
  const tabbableId =
    rovingId && itemIds.includes(rovingId) ? rovingId : defaultTabbable;

  const focusItem = (id: string) =>
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-tag-item="${CSS.escape(id)}"]`)
      ?.focus();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!NAV_KEYS.has(e.key)) return;
    if (!(document.activeElement instanceof HTMLElement)) return;
    const current = document.activeElement.getAttribute("data-tag-item");
    const idx = current ? itemIds.indexOf(current) : -1;
    if (idx === -1) return;
    e.preventDefault();

    const last = itemIds.length - 1;
    const next = Match.value(e.key).pipe(
      Match.when("Home", () => 0),
      Match.when("End", () => last),
      Match.when("ArrowRight", () => (idx + 1) % itemIds.length),
      Match.orElse(() => (idx + last) % itemIds.length)
    );

    setRovingId(itemIds[next]);
    focusItem(itemIds[next]);
  };

  const handleFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!(e.target instanceof HTMLElement)) return;
    const id = e.target.getAttribute("data-tag-item");
    if (id) setRovingId(id);
  };

  const onApply = (id: string) => {
    pendingFocusRef.current = id;
  };

  useEffect(() => {
    const prev = prevOverflowIdRef.current;
    prevOverflowIdRef.current = activeOverflowId;

    if (activeOverflowId && pendingFocusRef.current === activeOverflowId) {
      pendingFocusRef.current = null;
      const raf = requestAnimationFrame(() => {
        setRovingId(activeOverflowId);
        focusItem(activeOverflowId);
      });
      return () => cancelAnimationFrame(raf);
    }

    if (!prev || activeOverflowId || !isKeyboardMode()) return;
    const el = document.activeElement;
    const orphaned =
      !el || el === document.body || !containerRef.current?.contains(el);
    if (!orphaned) return;
    (
      containerRef.current?.querySelector<HTMLElement>("[data-tag-more]") ??
      containerRef.current?.querySelector<HTMLElement>("[data-tag-item]")
    )?.focus();
  }, [activeOverflowId]);

  return { containerRef, tabbableId, handleKeyDown, handleFocus, onApply };
}
