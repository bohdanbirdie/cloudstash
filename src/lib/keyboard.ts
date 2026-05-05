import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";

export type Scope =
  | "global"
  | "detail"
  | "selection"
  | "dock"
  | "dialog"
  | "popover";

const ESC_PRECEDENCE: readonly Scope[] = [
  "global",
  "detail",
  "selection",
  "dock",
  "dialog",
  "popover",
];

const FORM_TAGS = ["input", "textarea", "option"] as const;

const COMMANDS = {
  openDock: { keys: "meta+k,ctrl+k", scope: "global" },
  openAgent: { keys: "meta+j,ctrl+j", scope: "global" },
  vimDown: { keys: "j", scope: "global" },
  vimUp: { keys: "k", scope: "global" },
  dialogSubmit: { keys: "enter", scope: "dialog" },
  detailComplete: { keys: "meta+enter,ctrl+enter", scope: "detail" },
  bulkPrimary: { keys: "meta+enter,ctrl+enter", scope: "selection" },
  bulkSecondary: { keys: "meta+backspace,ctrl+backspace", scope: "selection" },
  bulkExport: { keys: "meta+e,ctrl+e", scope: "selection" },
} as const satisfies Record<string, { keys: string; scope: Scope }>;

const DIRECTIONS = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
] as const;

export type Direction = (typeof DIRECTIONS)[number];

function isDirection(key: string): key is Direction {
  return (DIRECTIONS as readonly string[]).includes(key);
}

const NAV = {
  listNav: { keys: "arrowup,arrowdown,home,end" },
  gridNav: { keys: "arrowup,arrowdown,arrowleft,arrowright" },
} as const satisfies Record<string, { keys: string }>;

export type CommandId = keyof typeof COMMANDS;
export type NavId = keyof typeof NAV;

export function topmostScope(active: readonly string[]): Scope | null {
  for (let i = ESC_PRECEDENCE.length - 1; i >= 0; i--) {
    if (active.includes(ESC_PRECEDENCE[i])) return ESC_PRECEDENCE[i];
  }
  return null;
}

export function useCommand(
  id: CommandId,
  handler: () => void,
  enabled = true
): void {
  const { keys, scope } = COMMANDS[id];
  useHotkeys(keys, handler, {
    enabled,
    enableOnFormTags: FORM_TAGS,
    preventDefault: true,
    scopes: [scope],
  });
}

export function useDismiss(
  scope: Scope,
  handler: () => void,
  enabled = true
): void {
  const { activeScopes } = useHotkeysContext();
  useHotkeys("escape", handler, {
    enabled: enabled && topmostScope(activeScopes) === scope,
    enableOnFormTags: FORM_TAGS,
  });
}

export function useNavigation<T extends HTMLElement = HTMLElement>(
  id: NavId,
  handler: (dir: Direction) => void
): RefObject<T | null> {
  return useHotkeys<T>(
    NAV[id].keys,
    (e) => {
      if (isDirection(e.key)) handler(e.key);
    },
    {
      enableOnFormTags: FORM_TAGS,
      preventDefault: true,
    }
  );
}

export function useGlobalNavigation(
  id: NavId,
  handler: (dir: Direction) => void,
  skipWhen?: (e: KeyboardEvent) => boolean
): void {
  const skipWhenRef = useRef(skipWhen);
  skipWhenRef.current = skipWhen;

  const ignoreEventWhen = useCallback(
    (e: KeyboardEvent) =>
      isContentEditableTarget(e) || (skipWhenRef.current?.(e) ?? false),
    []
  );

  useHotkeys(
    NAV[id].keys,
    (e) => {
      if (isDirection(e.key)) handler(e.key);
    },
    {
      enableOnFormTags: ["option"],
      preventDefault: true,
      ignoreEventWhen,
    }
  );
}

function isContentEditableTarget(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLElement && e.target.isContentEditable;
}
