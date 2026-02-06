import { Loader2Icon } from "lucide-react";

export function ChatLoading() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2Icon className="size-4 animate-spin" />
        Loading chat...
      </div>
    </div>
  );
}
