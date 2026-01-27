import { CheckIcon } from "lucide-react";

import { BorderTrail } from "@/components/ui/border-trail";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  linkProcessingStatus$,
  type LinkWithDetails,
} from "@/livestore/queries";
import { useAppStore } from "@/livestore/store";

interface LinkCardProps {
  link: LinkWithDetails;
  onClick: (e: React.MouseEvent) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

export function LinkCard({
  link,
  onClick,
  selected,
  selectionMode,
}: LinkCardProps) {
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
        "block w-full text-left relative transition-all",
        selectionMode
          ? "hover:ring-2 hover:ring-primary hover:ring-offset-2"
          : "[&_[data-slot=card]]:hover:bg-muted/50 [&_[data-slot=card]]:hover:ring-foreground/40"
      )}
    >
      {selected && (
        <div className="absolute -top-2 -right-2 z-10 rounded-full bg-primary p-1 shadow-md">
          <CheckIcon className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
      <Card
        className={cn(
          "transition-shadow overflow-hidden",
          link.image ? "h-full pt-0" : "h-full",
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
        {link.image && (
          <div className="aspect-video w-full overflow-hidden">
            <img
              src={link.image}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <CardHeader>
          <div className="flex items-center gap-2">
            {link.favicon && (
              <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
            )}
            <span className="text-muted-foreground text-xs truncate">
              {link.domain}
            </span>
          </div>
          <CardTitle className="line-clamp-2">{displayTitle}</CardTitle>
          {link.description && (
            <CardDescription className="line-clamp-2">
              {link.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <span className="text-muted-foreground text-xs">{formattedDate}</span>
        </CardContent>
      </Card>
    </button>
  );
}
