import {
  CheckCheck,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useRightPane } from "@/components/right-pane-context";
import { TagCombobox } from "@/components/tags/tag-combobox";
import { TagSuggestions } from "@/components/tags/tag-suggestions";
import { BorderTrail } from "@/components/ui/border-trail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useLinkTags } from "@/hooks/use-link-tags";
import { useTrackLinkOpen } from "@/hooks/use-track-link-open";
import type { LinkAction } from "@/lib/link-projections";
import { formatAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import {
  inboxLinks$,
  linkById$,
  linkProcessingStatus$,
} from "@/livestore/queries/links";
import type { LinkListItem, LinkWithDetails } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";

const SOURCE_CONFIG: Record<string, { icon: typeof SendIcon; label: string }> =
  {
    telegram: { icon: SendIcon, label: "Telegram" },
    api: { icon: CodeIcon, label: "API" },
    chat: { icon: MessageSquareIcon, label: "Chat" },
  };

export function DetailView({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const link = store.useQuery(linkById$(linkId));

  if (!link) return null;

  return <DetailViewInner link={link} />;
}

function DetailViewInner({ link }: { link: LinkWithDetails }) {
  useHotkeyScope("detail");

  const store = useAppStore();
  const trackLinkOpen = useTrackLinkOpen();
  const { closeDetail, navigate, projection } = useRightPane();

  useHotkeys("escape", closeDetail, { scopes: ["detail"] });

  const [copied, setCopied] = useState(false);

  const listQueryResult = store.useQuery(projection?.query ?? inboxLinks$);
  const links: readonly LinkListItem[] = projection ? listQueryResult : [];

  const processingRecord = store.useQuery(linkProcessingStatus$(link.id));
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";
  const isFailed = processingRecord?.status === "failed";

  const { tagIds, setTagIds } = useLinkTags(link.id);

  const currentIndex = links.findIndex((l) => l.id === link.id);

  const getNextLinkId = (): string | null => {
    const nextLink = links[currentIndex + 1] ?? links[currentIndex - 1];
    return nextLink?.id ?? null;
  };

  const handleAction = (action: LinkAction, commitFn: () => void) => {
    const willRemove = projection?.willActionRemoveLink(action) ?? true;
    const nextLinkId = willRemove ? getNextLinkId() : link.id;

    commitFn();

    if (nextLinkId && nextLinkId !== link.id) {
      trackLinkOpen(nextLinkId);
      navigate(nextLinkId);
    } else if (willRemove) {
      closeDetail();
    }
  };

  const handleComplete = () =>
    handleAction("complete", () => {
      store.commit(
        events.linkCompleted({ completedAt: new Date(), id: link.id })
      );
    });

  const handleUncomplete = () =>
    handleAction("uncomplete", () => {
      store.commit(events.linkUncompleted({ id: link.id }));
    });

  const handleDelete = () =>
    handleAction("delete", () => {
      store.commit(events.linkDeleted({ deletedAt: new Date(), id: link.id }));
    });

  const handleRestore = () =>
    handleAction("restore", () => {
      store.commit(events.linkRestored({ id: link.id }));
    });

  const handleReprocess = () => {
    store.commit(
      events.linkReprocessRequested({
        linkId: link.id,
        requestedAt: new Date(),
      })
    );
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
  };

  useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;
  const displayTitle = link.title || link.url;
  const monogram = link.domain?.charAt(0) ?? "";
  const source = link.source && link.source !== "app" ? link.source : null;
  const sourceConfig = source ? SOURCE_CONFIG[source] : null;
  const SourceIcon = sourceConfig?.icon;

  return (
    <div className="relative flex flex-col gap-6 pr-2 pb-8">
      {(isProcessing || isReprocessing) && (
        <BorderTrail
          className="bg-gradient-to-l from-blue-200 via-blue-500 to-blue-200 dark:from-blue-400 dark:via-blue-500 dark:to-blue-700"
          size={80}
          transition={{ duration: 4, ease: "linear", repeat: Infinity }}
        />
      )}

      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-background pt-3 pb-2">
        {links.length > 1 ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentIndex + 1}/{links.length}
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <HotkeyButton
            size="sm"
            variant="ghost"
            onClick={isCompleted ? handleUncomplete : handleComplete}
            onHotkeyPress={isCompleted ? handleUncomplete : handleComplete}
            aria-label={isCompleted ? "Mark as unread" : "Mark as complete"}
            hotkey="meta+enter"
            hotkeyEnabled={true}
            scope="detail"
          >
            <IconSwap iconKey={isCompleted ? "undo" : "check"}>
              {isCompleted ? <UndoIcon /> : <CheckIcon />}
            </IconSwap>
            <span>{isCompleted ? "Reopen" : "Complete"}</span>
          </HotkeyButton>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={handleCopy}
                  aria-label="Copy URL"
                >
                  <IconSwap iconKey={copied ? "copied" : "copy"}>
                    {copied ? (
                      <CheckCheck className="text-green-500" />
                    ) : (
                      <CopyIcon />
                    )}
                  </IconSwap>
                </Button>
              }
            />
            <TooltipContent>{copied ? "Copied" : "Copy URL"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  nativeButton={false}
                  render={
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open in new tab"
                    />
                  }
                >
                  <ExternalLinkIcon />
                </Button>
              }
            />
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="More actions"
                >
                  <EllipsisVerticalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleReprocess}
                disabled={isProcessing || isReprocessing}
              >
                <RefreshCwIcon
                  className={cn(
                    "size-4",
                    (isProcessing || isReprocessing) && "animate-spin"
                  )}
                />
                Reprocess
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={isDeleted ? handleRestore : handleDelete}
                className={
                  isDeleted
                    ? undefined
                    : "text-destructive focus:text-destructive"
                }
              >
                {isDeleted ? (
                  <RotateCcwIcon className="size-4" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                {isDeleted ? "Restore" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="aspect-video w-full overflow-hidden rounded-sm outline outline-black/10 -outline-offset-1 dark:outline-white/10">
        {link.image ? (
          <img
            src={link.image}
            alt=""
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl font-semibold uppercase leading-none text-muted-foreground">
            {monogram}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {link.favicon && (
            <img src={link.favicon} alt="" className="size-3.5" />
          )}
          {link.domain}
        </a>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{formatAgo(link.createdAt)}</span>
        {sourceConfig && SourceIcon && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <SourceIcon className="size-3" />
              {sourceConfig.label}
            </span>
          </>
        )}
        {isDeleted && (
          <>
            <span aria-hidden="true">·</span>
            <span>Trash</span>
          </>
        )}
        {isCompleted && !isDeleted && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-green-600">Completed</span>
          </>
        )}
      </div>

      <h2 className="text-[28px] font-extrabold leading-tight tracking-tight text-foreground text-balance">
        {displayTitle}
      </h2>

      {link.description && (
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {link.description}
        </p>
      )}

      <div className="h-px w-full bg-border" aria-hidden="true" />

      <DetailSummary
        summary={link.summary}
        isProcessing={isProcessing}
        isReprocessing={isReprocessing}
        isFailed={isFailed}
        onReprocess={handleReprocess}
      />

      <div className="flex flex-col gap-3">
        <div className="text-xs font-semibold text-muted-foreground">Tags</div>
        <TagCombobox
          selectedTagIds={tagIds}
          onChange={setTagIds}
          placeholder="Add tags..."
        />
        <TagSuggestions linkId={link.id} />
      </div>

      <div className="pt-2 text-xs text-muted-foreground/70">
        <Kbd aria-hidden="true">Esc</Kbd> to close
      </div>
    </div>
  );
}

function DetailSummary({
  summary,
  isProcessing,
  isReprocessing,
  isFailed,
  onReprocess,
}: {
  summary: string | null;
  isProcessing: boolean;
  isReprocessing: boolean;
  isFailed: boolean;
  onReprocess: () => void;
}) {
  if (summary) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground">
            Summary
          </div>
        </div>
        <Markdown className="text-sm leading-relaxed">{summary}</Markdown>
      </div>
    );
  }

  if (isProcessing || isReprocessing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-muted-foreground">
          Summary
        </div>
        <TextShimmer className="text-sm" duration={1.5}>
          Generating summary...
        </TextShimmer>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-muted-foreground">
            Summary
          </div>
          <button
            type="button"
            onClick={onReprocess}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Retry summary generation"
          >
            <RefreshCwIcon className="size-3" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Summary generation failed
        </p>
      </div>
    );
  }

  return null;
}

function IconSwap({
  iconKey,
  children,
}: {
  iconKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={iconKey}
        initial={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, scale: 0.25, filter: "blur(4px)" }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        className="inline-flex"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
