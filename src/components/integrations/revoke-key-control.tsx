import { Trash2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function RevokeKeyControl({
  keyName,
  onRevoke,
}: {
  keyName: string;
  onRevoke: () => Promise<boolean>;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const shouldFocusConfirmation = useRef(false);
  const shouldRestoreTrigger = useRef(false);

  const focusConfirmation = useCallback((element: HTMLButtonElement | null) => {
    if (element && shouldFocusConfirmation.current) {
      element.focus();
      shouldFocusConfirmation.current = false;
    }
  }, []);
  const restoreTrigger = useCallback((element: HTMLButtonElement | null) => {
    if (element && shouldRestoreTrigger.current) {
      element.focus();
      shouldRestoreTrigger.current = false;
    }
  }, []);

  const cancel = () => {
    if (isPending) return;
    shouldRestoreTrigger.current = true;
    setIsConfirming(false);
  };

  const revoke = async () => {
    if (isPending) return;
    setIsPending(true);
    const revoked = await onRevoke();
    if (revoked) {
      shouldRestoreTrigger.current = true;
      setIsConfirming(false);
      return;
    }
    setIsPending(false);
  };

  if (!isConfirming) {
    return (
      <Button
        ref={restoreTrigger}
        aria-label={`Revoke ${keyName}`}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive/30"
        onClick={() => {
          shouldFocusConfirmation.current = true;
          setIsConfirming(true);
        }}
        size="icon-sm"
        variant="ghost"
      >
        <Trash2Icon />
      </Button>
    );
  }

  return (
    <div className="flex h-6 shrink-0 items-center justify-end gap-1">
      <Button
        ref={focusConfirmation}
        aria-label={`Cancel revoking ${keyName}`}
        aria-disabled={isPending}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        onClick={cancel}
        size="xs"
        variant="ghost"
      >
        Cancel
      </Button>
      <Button
        aria-busy={isPending || undefined}
        aria-disabled={isPending}
        aria-label={`${isPending ? "Revoking" : "Confirm revoking"} ${keyName}`}
        className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
        onClick={() => void revoke()}
        size="sm"
        variant="destructive"
      >
        {isPending && (
          <Spinner aria-hidden className="size-3 motion-reduce:animate-none" />
        )}
        Revoke
      </Button>
    </div>
  );
}
