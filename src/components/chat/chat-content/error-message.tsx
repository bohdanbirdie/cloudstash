import { Match } from "effect";
import { AlertCircle } from "lucide-react";

export const ErrorMessage = ({ error }: { error: Error | undefined }) => {
  const message = getErrorMessage(error);

  return (
    <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
      <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
};

const getErrorMessage = (error: Error | undefined): string =>
  Match.value(error?.message?.toLowerCase().includes("rate limit")).pipe(
    Match.when(
      true,
      () => "Rate limit reached. Please try again in a few minutes."
    ),
    Match.orElse(() => "Something went wrong. Please try again.")
  );
