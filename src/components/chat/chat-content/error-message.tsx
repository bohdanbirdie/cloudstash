import { Match } from "effect";
import { AlertCircle } from "lucide-react";

export const ErrorMessage = ({ error }: { error: Error | undefined }) => {
  const message = getErrorMessage(error);

  return (
    <div
      role="alert"
      className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
};

const getErrorMessage = (error: Error | undefined): string =>
  Match.value(error?.message?.toLowerCase().includes("rate limit")).pipe(
    Match.when(
      true,
      () => "Chat is temporarily unavailable. Try again in a few minutes."
    ),
    Match.orElse(() => "Unable to answer right now. Try again.")
  );
