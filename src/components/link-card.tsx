import { useState, useEffect, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
  ExternalLinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  Trash2Icon,
  CopyIcon,
  CheckCheck,
  RotateCcwIcon,
  UndoIcon,
} from "lucide-react";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
import { ScrollableContent } from "@/components/ui/scrollable-content";
import { Spinner } from "@/components/ui/spinner";
import { linkProcessingStatus$ } from "@/livestore/queries";
import type { LinkWithDetails } from "@/livestore/queries";

function useModifierHold(delay = 1000) {
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        timeoutId = setTimeout(() => setShowHints(true), delay);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        if (timeoutId) clearTimeout(timeoutId);
        setShowHints(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [delay]);

  return showHints;
}

interface LinkCardProps {
  link: LinkWithDetails;
  onClick: () => void;
}

function LinkCard({ link, onClick }: LinkCardProps) {
  const displayTitle = link.title || link.url;
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left transition-opacity hover:opacity-80 cursor-pointer"
    >
      <Card className={link.image ? "h-full pt-0" : "h-full"}>
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

interface LinkDetailModalProps {
  link: LinkWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onRestore: () => void;
}

function LinkDetailModal({
  link,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onComplete,
  onUncomplete,
  onDelete,
  onRestore,
}: LinkDetailModalProps) {
  const store = useAppStore();
  const showHints = useModifierHold(1000);
  const [copied, setCopied] = useState(false);

  const processingRecord = store.useQuery(linkProcessingStatus$(link?.id ?? ""));
  const isProcessing = processingRecord?.status === "pending";

  const isCompleted = link?.status === "completed";
  const isDeleted = link?.deletedAt !== null;

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useHotkeys("BracketLeft", onPrevious, {
    enabled: open && hasPrevious,
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys("BracketRight", onNext, {
    enabled: open && hasNext,
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys("Enter", isCompleted ? onUncomplete : onComplete, {
    enabled: open,
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys("Backspace", isDeleted ? onRestore : onDelete, {
    enabled: open,
    preventDefault: true,
    enableOnFormTags: true,
  });

  if (!link) return null;

  const displayTitle = link.title || link.url;
  const formattedDate = new Date(link.createdAt).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        {link.image && (
          <div className="aspect-video w-full overflow-hidden rounded-sm -mt-2">
            <img
              src={link.image}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
        )}

        <DialogHeader>
          <div className="flex items-center gap-2">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors"
            >
              {link.favicon && (
                <img src={link.favicon} alt="" className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs">{link.domain}</span>
              <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              aria-label="Copy link"
            >
              {copied ? (
                <CheckCheck className="h-3 w-3 text-green-500" />
              ) : (
                <CopyIcon className="h-3 w-3" />
              )}
            </button>
          </div>
          <DialogTitle className="text-base">{displayTitle}</DialogTitle>
          {link.description && (
            <ScrollableContent
              maxHeightClass={link.summary ? "max-h-32" : "max-h-48"}
              className="text-sm text-muted-foreground"
            >
              <Markdown>{link.description}</Markdown>
            </ScrollableContent>
          )}
        </DialogHeader>

        {link.summary ? (
          <div className="border-l-2 border-primary/50 bg-muted/50 pl-3 py-2 space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              AI Summary
            </h4>
            <ScrollableContent
              maxHeightClass="max-h-40"
              fadeFromClass="from-muted/50"
            >
              <Markdown className="leading-relaxed">{link.summary}</Markdown>
            </ScrollableContent>
          </div>
        ) : isProcessing ? (
          <div className="border-l-2 border-muted-foreground/30 bg-muted/50 pl-3 py-2 flex items-center gap-2">
            <Spinner className="size-3" />
            <span className="text-sm text-muted-foreground">Generating summary...</span>
          </div>
        ) : null}

        <div className="text-xs text-muted-foreground">
          Saved on {formattedDate}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div className="flex gap-1 items-center">
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={onPrevious}
                disabled={!hasPrevious}
                aria-label="Previous link"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              {showHints && (
                <Kbd className="absolute -top-6 left-1/2 -translate-x-1/2">[</Kbd>
              )}
            </div>
            <div className="relative">
              <Button
                variant="outline"
                size="icon"
                onClick={onNext}
                disabled={!hasNext}
                aria-label="Next link"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              {showHints && (
                <Kbd className="absolute -top-6 left-1/2 -translate-x-1/2">]</Kbd>
              )}
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <div className="relative">
              <Button
                size="icon"
                onClick={isCompleted ? onUncomplete : onComplete}
                aria-label={isCompleted ? "Mark as unread" : "Mark as complete"}
              >
                {isCompleted ? (
                  <UndoIcon className="h-4 w-4" />
                ) : (
                  <CheckIcon className="h-4 w-4" />
                )}
              </Button>
              {showHints && (
                <Kbd className="absolute -top-6 left-1/2 -translate-x-1/2">↵</Kbd>
              )}
            </div>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={isDeleted ? onRestore : onDelete}
                aria-label={isDeleted ? "Restore link" : "Delete link"}
              >
                {isDeleted ? (
                  <RotateCcwIcon className="h-4 w-4" />
                ) : (
                  <Trash2Icon className="h-4 w-4" />
                )}
              </Button>
              {showHints && (
                <Kbd className="absolute -top-6 left-1/2 -translate-x-1/2">Bksp</Kbd>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LinkGridProps {
  links: readonly LinkWithDetails[];
  emptyMessage?: string;
}

export function LinkGrid({
  links,
  emptyMessage = "No links yet",
}: LinkGridProps) {
  const store = useAppStore();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const selectedLink =
    selectedIndex !== null ? (links[selectedIndex] ?? null) : null;
  const hasPrevious = selectedIndex !== null && selectedIndex > 0;
  const hasNext = selectedIndex !== null && selectedIndex < links.length - 1;

  const goToPrevious = () => {
    if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const handleComplete = useCallback(() => {
    if (!selectedLink) return;
    store.commit(events.linkCompleted({ id: selectedLink.id, completedAt: new Date() }));
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1);
    } else {
      setSelectedIndex(null);
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex]);

  const handleUncomplete = useCallback(() => {
    if (!selectedLink) return;
    store.commit(events.linkUncompleted({ id: selectedLink.id }));
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1);
    } else {
      setSelectedIndex(null);
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex]);

  const handleDelete = useCallback(() => {
    if (!selectedLink) return;
    store.commit(events.linkDeleted({ id: selectedLink.id, deletedAt: new Date() }));
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1);
    } else {
      setSelectedIndex(null);
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex]);

  const handleRestore = useCallback(() => {
    if (!selectedLink) return;
    store.commit(events.linkRestored({ id: selectedLink.id }));
    // Move to next link or close modal
    if (hasNext) {
      // Index stays the same since the current link will be removed from this list
    } else if (hasPrevious) {
      setSelectedIndex(selectedIndex - 1);
    } else {
      setSelectedIndex(null);
    }
  }, [selectedLink, store, hasNext, hasPrevious, selectedIndex]);

  if (links.length === 0) {
    return (
      <div className="text-muted-foreground text-center py-12">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link, index) => (
          <LinkCard
            key={link.id}
            link={link}
            onClick={() => setSelectedIndex(index)}
          />
        ))}
      </div>

      <LinkDetailModal
        link={selectedLink}
        open={selectedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedIndex(null);
        }}
        onPrevious={goToPrevious}
        onNext={goToNext}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onComplete={handleComplete}
        onUncomplete={handleUncomplete}
        onDelete={handleDelete}
        onRestore={handleRestore}
      />
    </>
  );
}
