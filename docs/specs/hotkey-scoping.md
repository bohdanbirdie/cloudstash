# Hotkey Scoping

Status: Implemented

## Problem

Keyboard shortcuts conflict between UI layers. Example: `cmd+backspace` in TagCombobox input deletes the link instead of text, because hotkeys were globally registered with `enableOnFormTags: true`.

## Solution

Scope-based hotkey management using `react-hotkeys-hook`'s `HotkeysProvider` and scope system.

`useHotkeyScope` hook (`src/hooks/use-hotkey-scope.ts`) manages scope lifecycle — enables on mount, disables on unmount, optionally disables other scopes while active.

## Scope Hierarchy

| Scope | When Active | Disables |
|---|---|---|
| `global` | Always | — |
| `dialog` | Dialog open | — |
| `selection` | Items selected | — |
| `popover` | TagCombobox open | `dialog`, `selection` |

When a popover opens, it disables the `dialog` scope so parent hotkeys don't fire. `cmd+backspace` in input deletes text only.

## Key Design Decisions

- `enableOnFormTags: false` by default on `HotkeyButton`
- `HotkeysProvider` wraps `_authed.tsx` with `initiallyActiveScopes: ["global"]`
- Each component opts into its scope via `useHotkeyScope` and passes `scope` prop to `HotkeyButton`
