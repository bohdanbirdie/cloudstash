import { CheckIcon } from "lucide-react";

import { BorderTrail } from "@/components/ui/border-trail";
import { cn } from "@/lib/utils";
import {
  linkProcessingStatus$,
  type LinkWithDetails,
} from "@/livestore/queries";
import { useAppStore } from "@/livestore/store";

interface LinkListItemProps {
  link: LinkWithDetails;
  onClick: (e: React.MouseEvent) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

export function LinkListItem({
  link,
  onClick,
  selected,
  selectionMode,
}: LinkListItemProps) {
  const store = useAppStore();
  const processingRecord = store.useQuery(linkProcessingStatus$(link.id));
  const isProcessing = processingRecord?.status === "pending";

  const displayTitle = link.title || link.url;
  const formattedDate = new Date(link.createdAt).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full flex-col gap-1 ring-1 ring-foreground/10 bg-card p-3 text-left transition-all",
        selectionMode
          ? "hover:ring-2 hover:ring-primary hover:ring-offset-2"
          : "hover:bg-muted/50 hover:ring-foreground/40",
        selected && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {isProcessing && (
        <BorderTrail
          className="bg-gradient-to-l from-blue-200 via-blue-500 to-blue-200 dark:from-blue-400 dark:via-blue-500 dark:to-blue-700"
          size={80}
          transition={{
            duration: 4,
            ease: "linear",
            repeat: Infinity,
          }}
        />
      )}
      {selected && (
        <div className="absolute -top-2 -right-2 z-10 rounded-full bg-primary p-1 shadow-md">
          <CheckIcon className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium truncate flex-1 w-0">{displayTitle}</p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          {link.favicon && (
            <img src={link.favicon} alt="" className="h-4 w-4" />
          )}
          {link.domain}
        </span>
      </div>
      {link.description && (
        <p className="text-sm text-muted-foreground truncate w-0 min-w-full">
          {link.description}
        </p>
      )}
      <span className="text-xs text-muted-foreground">{formattedDate}</span>
    </button>
  );
}
