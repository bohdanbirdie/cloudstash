# Custom oxlint rules

Local oxlint JS plugins for this repo, registered in `vite.config.ts` under
`lint.jsPlugins` and run as part of `vp check` / `vp lint`.

## `tailwind-cn/enforce-cn`

Requires dynamic `className` values to go through `cn()` and conditional classes
inside `cn()` to use object syntax.

```tsx
// rejected
<div className={`base ${active ? "active" : ""}`} />;
<div className={active && "active"} />;
<div className={cn("base", active ? "active" : "")} />;

// accepted
<div className={cn("base", { active })} />;
```

**Caught in `className`:** dynamic template strings, `+` concatenation,
ternaries, and logical expressions that do not go through `cn()`.

**Caught in `cn` / `clsx` / `classnames` / `classNames`:** the same expression
forms when passed as direct arguments, because conditional classes belong in an
object (`{ "class-name": condition }`). Static strings, class variables, and
existing object syntax remain valid.

The rule is report-only. Adding imports and restructuring arbitrary expressions
is not a safe mechanical fix.

## `motion/no-use-reduced-motion`

Forbids importing `useReducedMotion` from `motion/react` / `framer-motion`.

```tsx
// before — hand-gating every animation prop
const reduce = useReducedMotion();
<motion.div animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }} />;

// after — one global config, set once at the app root (src/main.tsx)
<MotionConfig reducedMotion="user">{app}</MotionConfig>;
<motion.div animate={{ scale: 1, opacity: 1 }} />;
```

`MotionConfig reducedMotion="user"` disables transform and layout animations
while keeping `opacity`/`backgroundColor`, so per-component `useReducedMotion`
plumbing for those cases is redundant. Report-only — there is no safe
mechanical fix, since removing the hook also means deleting the JSX it gated.

**Caught:** a named import of `useReducedMotion` (incl. aliased) from
`motion/react` or `framer-motion`.

## `anti-slop/no-module-mocking`

Forbids `vi.mock`, `vi.doMock`, `jest.mock`, and equivalent module-level test
mocks. Worker tests enable this rule so dependencies must be replaced through a
real service/layer seam or exercised through the installed library's real API.
The rule is adapted from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop).

## `anti-slop/no-chained-type-assertions`

Forbids production code from forcing a value through assertion chains such as
`value as unknown as Target`. A precise source type, validation, or a real
boundary adapter must provide the missing evidence. Tests are excluded because
their partial platform fixtures intentionally do not implement entire runtime
interfaces. The rule is adapted from `dmmulroy/anti-slop`.

**Skipped by design:** a same-named import from any other module, and the
`MotionConfig` / `motion` imports themselves.

Behavior fixtures and tests for both rules live in `__tests__/`.
