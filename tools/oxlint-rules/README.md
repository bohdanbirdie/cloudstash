# Custom oxlint rules

Local oxlint JS plugins for this repo, registered in `vite.config.ts` under
`lint.jsPlugins` and run as part of `vp check` / `vp lint`.

## `tailwind-cn/no-cn-ternary`

Flags a ternary used for class names inside a `cn()` / `clsx()` call and
autofixes it to clsx object syntax.

```tsx
// before
cn("base", inverted ? "text-white" : "text-black");
// after
cn("base", { "text-white": inverted, "text-black": !inverted });
```

**Caught:** a ternary that is a direct argument to `cn` / `clsx` / `classnames` /
`classNames` with two string-literal branches.

**Skipped by design:** single-sided `cond && "x"`, existing object syntax, a bare
`className={cond ? a : b}` not wrapped in `cn()`, empty-string branches, and
non-string branches.

The autofix flips equality operators (`a === b` → `a !== b`) and strips an
existing `!` instead of double-negating. oxfmt then re-wraps and de-quotes keys.

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

**Skipped by design:** a same-named import from any other module, and the
`MotionConfig` / `motion` imports themselves.

Behavior fixtures and tests for both rules live in `__tests__/`.
