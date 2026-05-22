import { CheckIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { deleteAccount } from "@/lib/delete-account";
import type { DeleteAccountError } from "@/lib/delete-account";
import { cn } from "@/lib/utils";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CONFIRM_PHRASE = "DELETE";
const ERROR_ID = "settings-delete-error";

const messageFor = (error: DeleteAccountError): string =>
  error.tag === "session-expired"
    ? "Please sign in again, then try once more."
    : error.message;

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<DeleteAccountError | null>(null);

  const canDelete = confirmation === CONFIRM_PHRASE;

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
    if (!next) {
      setConfirmation("");
      setError(null);
    }
  };

  const handleConfirm = async () => {
    if (!canDelete || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await deleteAccount();
    if (!result) return; // navigation in flight — keep the dialog locked
    setSubmitting(false);
    setError(result);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete account</AlertDialogTitle>
          <AlertDialogDescription className="text-sm/relaxed">
            This permanently deletes your account and all saved links. This
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="settings-confirm-delete"
            className="text-xs/relaxed text-muted-foreground"
          >
            Type{" "}
            <span className="rounded bg-muted px-1 font-mono text-foreground">
              {CONFIRM_PHRASE}
            </span>{" "}
            to confirm.
          </label>
          <div className="relative">
            <Input
              id="settings-confirm-delete"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (error) setError(null);
              }}
              className={cn(
                "pr-7 transition-colors",
                canDelete && "border-destructive/40 ring-2 ring-destructive/20"
              )}
            />
            {canDelete && (
              <CheckIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-destructive motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-75 motion-safe:duration-150"
              />
            )}
          </div>
        </div>

        {error && (
          <div
            id={ERROR_ID}
            role="alert"
            className="text-xs/relaxed text-destructive"
          >
            {messageFor(error)}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canDelete || submitting}
            onClick={handleConfirm}
            aria-describedby={error ? ERROR_ID : undefined}
          >
            {submitting ? (
              <>
                <Spinner className="size-3.5" />
                Deleting…
              </>
            ) : (
              "Delete account"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
