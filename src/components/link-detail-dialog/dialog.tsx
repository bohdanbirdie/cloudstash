import {
  CheckCheck,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import { useState } from "react";

import { LinkImage } from "@/components/link-card";
import { TagCombobox } from "@/components/tags/tag-combobox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Markdown } from "@/components/ui/markdown";
import { ScrollableContent } from "@/components/ui/scrollable-content";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useLinkTags } from "@/hooks/use-link-tags";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import { type LinkAction, type LinkProjection } from "@/lib/link-projections";
import {
  linkById$,
  linkProcessingStatus$,
  type LinkWithDetails,
} from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

function StatusBadge({ link }: { link: LinkWithDetails }) {
  if (link.deletedAt) {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground"
      >
        Trash
      </Badge>
    );
  }
  if (link.status === "completed") {
    return (
      <Badge
        variant="secondary"
        className="text-[10px] px-1.5 py-0 bg-green-500/15 text-green-600"
      >
        Completed
      </Badge>
    );
  }
  return null;
}

interface LinkDetailDialogContentProps {
  linkId: string;
  projection?: LinkProjection;
  onClose: () => void;
  onNavigate: (linkId: string) => void;
}

export function LinkDetailDialogContent({
  linkId,
  projection,
  onClose,
  onNavigate,
}: LinkDetailDialogContentProps) {
  useHotkeyScope("dialog");

  const store = useAppStore();
  const trackLinkOpen = useTrackLinkOpen();
  const [copied, setCopied] = useState(false);

  const link = store.useQuery(linkById$(linkId));
  const links: readonly LinkWithDetails[] = projection
    ? store.useQuery(projection.query)
    : [];

  if (!link) {
    onClose();
    return null;
  }

  const currentIndex = links.findIndex((l) => l.id === linkId);
  const hasNavigation = links.length > 1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < links.length - 1;

  const getNextLinkId = (): string | null => {
    const nextLink = links[currentIndex + 1] ?? links[currentIndex - 1];
    return nextLink?.id ?? null;
  };

  const goToPrevious = () => {
    const prevLink = links[currentIndex - 1];
    if (prevLink) {
      trackLinkOpen(prevLink.id);
      onNavigate(prevLink.id);
    }
  };

  const goToNext = () => {
    const nextLink = links[currentIndex + 1];
    if (nextLink) {
      trackLinkOpen(nextLink.id);
      onNavigate(nextLink.id);
    }
  };

  const handleAction = (action: LinkAction, commitFn: () => void) => {
    const willRemove = projection?.willActionRemoveLink(action) ?? true;
    const nextLinkId = willRemove ? getNextLinkId() : linkId;

    commitFn();

    if (nextLinkId && nextLinkId !== linkId) {
      trackLinkOpen(nextLinkId);
      onNavigate(nextLinkId);
    } else if (willRemove) {
      onClose();
    }
  };

  const handleComplete = () =>
    handleAction("complete", () => {
      store.commit(
        events.linkCompleted({ completedAt: new Date(), id: linkId })
      );
    });

  const handleUncomplete = () =>
    handleAction("uncomplete", () => {
      store.commit(events.linkUncompleted({ id: linkId }));
    });

  const handleDelete = () =>
    handleAction("delete", () => {
      store.commit(events.linkDeleted({ deletedAt: new Date(), id: linkId }));
    });

  const handleRestore = () =>
    handleAction("restore", () => {
      store.commit(events.linkRestored({ id: linkId }));
    });

  const processingRecord = store.useQuery(linkProcessingStatus$(linkId));
  const isProcessing = processingRecord?.status === "pending";
  const { tagIds, setTagIds } = useLinkTags(linkId);

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayTitle = link.title || link.url;
  const formattedDate = new Date(link.createdAt).toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  });

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
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
            <StatusBadge link={link} />
          </div>
          <DialogTitle className="text-base">{displayTitle}</DialogTitle>
        </DialogHeader>

        <ScrollableContent maxHeightClass="max-h-[60vh]" className="space-y-6">
          <div
            className={
              link.description ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""
            }
          >
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-90 transition-opacity"
            >
              <LinkImage
                src={link.image}
                objectFit="contain"
                iconClassName="h-12 w-12"
              />
            </a>
            {link.description && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Description
                </h4>
                <div className="text-sm">
                  <Markdown>{link.description}</Markdown>
                </div>
              </div>
            )}
          </div>

          {link.summary ? (
            <div className="border-l-2 border-primary/50 bg-muted/50 pl-3 py-2 space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                AI Summary
              </h4>
              <Markdown className="leading-relaxed">{link.summary}</Markdown>
            </div>
          ) : isProcessing ? (
            <div className="border-l-2 border-muted-foreground/30 bg-muted/50 pl-3 py-2">
              <TextShimmer className="text-sm" duration={1.5}>
                Generating summary...
              </TextShimmer>
            </div>
          ) : null}

          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tags
            </h4>
            <TagCombobox
              selectedTagIds={tagIds}
              onChange={setTagIds}
              placeholder="Add tags..."
            />
          </div>

          <div className="text-xs text-muted-foreground pt-2 border-t">
            Saved on {formattedDate}
          </div>
        </ScrollableContent>

        <DialogFooter
          className={
            hasNavigation
              ? "flex-row justify-between sm:justify-between"
              : "flex-row justify-end sm:justify-end"
          }
        >
          {hasNavigation && (
            <div className="flex gap-1 items-center">
              <HotkeyButton
                variant="outline"
                size="icon"
                onClick={goToPrevious}
                onHotkeyPress={goToPrevious}
                disabled={!hasPrevious}
                aria-label="Previous link"
                hotkey="BracketLeft"
                hotkeyEnabled={true}
                scope="dialog"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </HotkeyButton>
              <HotkeyButton
                variant="outline"
                size="icon"
                onClick={goToNext}
                onHotkeyPress={goToNext}
                disabled={!hasNext}
                aria-label="Next link"
                hotkey="BracketRight"
                hotkeyEnabled={true}
                scope="dialog"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </HotkeyButton>
            </div>
          )}
          <div className="flex gap-1 items-center">
            <HotkeyButton
              size="icon"
              onClick={isCompleted ? handleUncomplete : handleComplete}
              onHotkeyPress={isCompleted ? handleUncomplete : handleComplete}
              aria-label={isCompleted ? "Mark as unread" : "Mark as complete"}
              hotkey="meta+enter"
              hotkeyEnabled={true}
              scope="dialog"
            >
              {isCompleted ? (
                <UndoIcon className="h-4 w-4" />
              ) : (
                <CheckIcon className="h-4 w-4" />
              )}
            </HotkeyButton>
            <HotkeyButton
              variant="ghost"
              size="icon"
              onClick={isDeleted ? handleRestore : handleDelete}
              onHotkeyPress={isDeleted ? handleRestore : handleDelete}
              aria-label={isDeleted ? "Restore link" : "Delete link"}
              hotkey="meta+backspace"
              hotkeyEnabled={true}
              scope="dialog"
            >
              {isDeleted ? (
                <RotateCcwIcon className="h-4 w-4" />
              ) : (
                <Trash2Icon className="h-4 w-4" />
              )}
            </HotkeyButton>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
