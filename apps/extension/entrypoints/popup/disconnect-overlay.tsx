import { LogOut } from "lucide-react";
import { useRef } from "react";

import { Button } from "../../components/ui/button";
import { KeyboardHint } from "./ui";

export function DisconnectOverlay({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cs-disconnect-title"
      aria-describedby="cs-disconnect-desc"
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/95 px-6 text-center backdrop-blur-[2px] animate-in fade-in-0 duration-150"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          onConfirm();
          return;
        }
        if (e.key === "Tab") {
          const buttons = dialogRef.current?.querySelectorAll("button");
          if (!buttons || buttons.length === 0) return;
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          const active = document.activeElement;
          if (e.shiftKey && active === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <LogOut className="size-4" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2
          id="cs-disconnect-title"
          className="text-sm font-semibold tracking-tight"
        >
          Disconnect Cloudstash?
        </h2>
        <p
          id="cs-disconnect-desc"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          This signs this browser out. Your saved links stay safe — reconnect
          anytime.
        </p>
      </div>
      <div className="flex w-full gap-2">
        <Button variant="ghost" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button
          autoFocus
          variant="destructive"
          onClick={onConfirm}
          className="flex-1"
        >
          Disconnect
        </Button>
      </div>
      <KeyboardHint keys={["↵", "esc"]} label="disconnect · cancel" />
    </div>
  );
}
