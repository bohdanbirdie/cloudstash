import type { ReactNode } from "react";

import { Spinner } from "../../components/ui/spinner";

// Locks the popup body so it doesn't reflow as we move between loading,
// connect, and save screens. Tuned to the longest natural screen height.
export const POPUP_MIN_HEIGHT = "min-h-[320px]";

export function ErrorLine({ message }: { message: string | null }) {
  // No reserved height — the message inserts on demand (role=alert announces
  // it) and pushes the button down. A momentary shift reads better here than a
  // permanent gap under the input.
  if (!message) return null;
  return (
    <p
      role="alert"
      className="text-[11px] leading-4 text-destructive animate-in fade-in-0 duration-150"
    >
      {message}
    </p>
  );
}

export function LoadingShell({ children }: { children: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex ${POPUP_MIN_HEIGHT} flex-col items-center justify-center gap-3 text-xs text-muted-foreground`}
    >
      <Spinner />
      <span>{children}</span>
    </div>
  );
}

export function KeyboardHint({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
      <span className="inline-flex items-center gap-0.5">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="rounded-sm border border-border/80 bg-muted px-1 text-[9px] leading-none py-0.5 font-medium"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function SectionLabel({
  children,
  as: As = "span",
}: {
  children: ReactNode;
  as?: "span" | "h1" | "h2";
}) {
  return (
    <As className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </As>
  );
}

export function TextToggle({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-sm text-[11px] text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
    </button>
  );
}
