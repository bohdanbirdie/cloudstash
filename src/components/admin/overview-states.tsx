import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangleIcon className="h-8 w-8 text-destructive opacity-80" />
      <div>
        <p className="text-sm font-medium">Couldn’t load the dashboard</p>
        <p className="mx-auto mt-1 max-w-sm text-xs break-words text-muted-foreground">
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon />
          Try again
        </Button>
      )}
    </div>
  );
}

export function StaleNote({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="truncate">
        Couldn’t refresh — showing the last loaded data.
      </span>
      {onRetry && (
        <Button
          variant="link"
          size="sm"
          onClick={onRetry}
          className="h-auto shrink-0 px-0"
        >
          Retry
        </Button>
      )}
    </div>
  );
}
