# Hotkey Scoping Spec

## Problem

Keyboard shortcuts conflict between UI layers. For example:

- Link detail dialog has `cmd+backspace` to delete the current link
- TagCombobox popover has a search input
- When typing in the input and pressing `cmd+backspace` to delete text, it also triggers the delete link action

This happens because hotkeys are globally registered without awareness of UI layers or focus state.

## Root Cause

The `HotkeyButton` component (`src/components/ui/hotkey-button.tsx`) uses `react-hotkeys-hook` with:

```tsx
useHotkeys(hotkey ?? "", onHotkeyPress ?? (() => {}), {
  enableOnFormTags: true, // <-- This is the problem
  enabled: Boolean(hotkey && onHotkeyPress && hotkeyEnabled && !disabled),
  preventDefault: true,
});
```

Setting `enableOnFormTags: true` means hotkeys fire even when inputs are focused.

## Solution: Scope-Based Hotkey Management

Use `react-hotkeys-hook`'s built-in `HotkeysProvider` and scope system to manage hotkey layers.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      HotkeysProvider                            │
│                  initiallyActiveScopes: ["global"]              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SCOPE: global (always active)                          │   │
│  │  ├── Sidebar: mod+b                                     │   │
│  │  └── ChatSheet: meta+j                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SCOPE: dialog (active when dialog open)                │   │
│  │  ├── LinkDetailDialog                                   │   │
│  │  │   ├── [, ]         → navigate links                  │   │
│  │  │   ├── meta+enter   → complete/uncomplete             │   │
│  │  │   └── meta+backspace → delete/restore                │   │
│  │  └── AddLinkDialog                                      │   │
│  │      ├── escape       → cancel                          │   │
│  │      └── enter        → submit/view                     │   │
│  │                                                         │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │  SCOPE: popover (when TagCombobox open)           │  │   │
│  │  │  disableScopes: ["dialog", "selection"]           │  │   │
│  │  │                                                   │  │   │
│  │  │  ┌─────────────────────────────────────────────┐  │  │   │
│  │  │  │  Input Field                                │  │  │   │
│  │  │  │  cmd+backspace → deletes text (not link!)   │  │  │   │
│  │  │  └─────────────────────────────────────────────┘  │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  SCOPE: selection (active when selectedCount > 0)       │   │
│  │  └── SelectionToolbar                                   │   │
│  │      ├── escape         → clear selection               │   │
│  │      ├── meta+e         → export                        │   │
│  │      ├── meta+enter     → complete/uncomplete           │   │
│  │      └── meta+backspace → delete/restore                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Scope Transition Example

When TagCombobox opens inside LinkDetailDialog:

```
  BEFORE (popover closed)          AFTER (popover open)
  ┌────────────────────┐           ┌────────────────────┐
  │ global    ✓ active │           │ global    ✓ active │
  │ dialog    ✓ active │    ──►    │ dialog    ✗ disabled│
  │ selection ✗        │           │ selection ✗        │
  │ popover   ✗        │           │ popover   ✓ active │
  └────────────────────┘           └────────────────────┘

  cmd+backspace in input:          cmd+backspace in input:
  → triggers link delete!          → deletes text only ✓
```

When a popover opens, it disables the `dialog` scope so parent hotkeys don't fire.

## Implementation

### 1. Add HotkeysProvider to App Root

**File:** `src/routes/_authed.tsx`

```tsx
import { HotkeysProvider } from "react-hotkeys-hook";

function AuthedLayout() {
  return (
    <HotkeysProvider initiallyActiveScopes={["global"]}>
      {/* existing content */}
    </HotkeysProvider>
  );
}
```

### 2. Create useHotkeyScope Hook

**File:** `src/hooks/use-hotkey-scope.ts`

```tsx
import { useHotkeysContext } from "react-hotkeys-hook";
import { useEffect } from "react";

/**
 * Manages hotkey scope lifecycle.
 * Enables scope on mount, disables on unmount.
 * Optionally disables other scopes while active.
 */
export function useHotkeyScope(
  scope: string,
  options?: {
    enabled?: boolean;
    disableScopes?: string[];
  }
) {
  const { enableScope, disableScope } = useHotkeysContext();
  const enabled = options?.enabled ?? true;
  const disableScopes = options?.disableScopes ?? [];

  useEffect(() => {
    if (!enabled) return;

    // Disable parent scopes
    disableScopes.forEach((s) => disableScope(s));

    // Enable this scope
    enableScope(scope);

    return () => {
      // Disable this scope
      disableScope(scope);

      // Re-enable parent scopes
      disableScopes.forEach((s) => enableScope(s));
    };
  }, [scope, enabled, disableScopes, enableScope, disableScope]);
}
```

### 3. Update HotkeyButton Component

**File:** `src/components/ui/hotkey-button.tsx`

```tsx
interface HotkeyButtonProps
  extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  kbdLabel?: string;
  hotkey?: string;
  hotkeyEnabled?: boolean;
  onHotkeyPress?: () => void;
  scope?: string; // NEW: optional scope
}

export function HotkeyButton({
  kbdLabel,
  hotkey,
  hotkeyEnabled = true,
  onHotkeyPress,
  disabled,
  scope, // NEW
  ...props
}: HotkeyButtonProps) {
  useHotkeys(hotkey ?? "", onHotkeyPress ?? (() => {}), {
    enableOnFormTags: false, // CHANGED: disable by default
    enabled: Boolean(hotkey && onHotkeyPress && hotkeyEnabled && !disabled),
    preventDefault: true,
    scopes: scope ? [scope] : undefined, // NEW: scope support
  });
  // ...
}
```

### 4. Update Link Detail Dialog

**File:** `src/components/link-detail-dialog/dialog.tsx`

```tsx
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";

export function LinkDetailDialogContent({ ... }) {
  // Enable dialog scope when dialog is open
  useHotkeyScope("dialog");

  return (
    <Dialog>
      {/* ... */}
      <HotkeyButton
        hotkey="meta+backspace"
        scope="dialog" // NEW: scoped to dialog
        // ...
      />
    </Dialog>
  );
}
```

### 5. Update TagCombobox

**File:** `src/components/tags/tag-combobox.tsx`

```tsx
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";

export function TagCombobox({ ... }) {
  const [isOpen, setIsOpen] = useState(false);

  // When popover is open, disable dialog scope
  useHotkeyScope("popover", {
    enabled: isOpen,
    disableScopes: ["dialog"],
  });

  // ... rest of component
}
```

## Scope Hierarchy

| Scope       | When Active      | Hotkeys                                                     | Disables              |
| ----------- | ---------------- | ----------------------------------------------------------- | --------------------- |
| `global`    | Always           | `mod+b` (sidebar), `meta+j` (chat)                          | -                     |
| `dialog`    | Dialog open      | `meta+enter`, `meta+backspace`, `[`, `]`, `escape`, `enter` | -                     |
| `selection` | Items selected   | `escape`, `meta+e`, `meta+enter`, `meta+backspace`          | -                     |
| `popover`   | TagCombobox open | -                                                           | `dialog`, `selection` |

## Migration Checklist

### Phase 1: Setup

- [x] Add `HotkeysProvider` to `_authed.tsx`
- [x] Create `useHotkeyScope` hook
- [x] Update `HotkeyButton` with scope support
- [x] Change `enableOnFormTags` default to `false`

### Phase 2: Migrate Components

- [x] Update `LinkDetailDialogContent` - add `dialog` scope
- [x] Update `AddLinkDialogContent` - add `dialog` scope
- [x] Update `TagCombobox` - disable `dialog` and `selection` scopes when open
- [x] Update `SelectionToolbar` - add `selection` scope
- [x] Update `ChatSheetProvider` - add `global` scope
- [x] Update `Sidebar` toggle - add `global` scope

### Phase 3: Testing

- [x] Test `cmd+backspace` in TagCombobox input (should NOT delete link)
- [x] Test `cmd+backspace` outside input (should delete link)
- [x] Test dialog navigation `[` and `]` still work
- [x] Test `cmd+enter` to complete link
- [x] Test `escape` closes popover without closing dialog
- [x] Test sidebar toggle `mod+b` works everywhere
- [x] Test chat toggle `mod+j` works everywhere

## Files to Modify

1. `src/routes/_authed.tsx` - Add HotkeysProvider
2. `src/hooks/use-hotkey-scope.ts` - New hook
3. `src/components/ui/hotkey-button.tsx` - Add scope prop, change enableOnFormTags
4. `src/components/link-detail-dialog/dialog.tsx` - Add dialog scope
5. `src/components/tags/tag-combobox.tsx` - Disable dialog scope when open
6. `src/components/selection-toolbar.tsx` - Add selection scope (optional)

## References

- [react-hotkeys-hook scopes documentation](https://react-hotkeys-hook.vercel.app/docs/documentation/scopes)
- [WAI-ARIA keyboard interaction patterns](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/)
