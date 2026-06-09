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

Behavior fixtures and tests live in `__tests__/`.
