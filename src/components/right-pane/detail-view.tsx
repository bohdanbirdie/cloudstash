import {
  CodeIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  SendIcon,
} from "lucide-react";
import { memo, useCallback, useDeferredValue, useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { useRightPaneActions } from "@/components/right-pane-context";
import { TagCombobox } from "@/components/tags/tag-combobox";
import { TagSuggestions } from "@/components/tags/tag-suggestions";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useLinkTags } from "@/hooks/use-link-tags";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { formatAgo } from "@/lib/time-ago";
import { linkById$, linkProcessingStatus$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useInSelectionMode } from "@/stores/selection-store";

const SOURCE_CONFIG: Record<string, { icon: typeof SendIcon; label: string }> =
  {
    telegram: { icon: SendIcon, label: "Telegram" },
    api: { icon: CodeIcon, label: "API" },
    chat: { icon: MessageSquareIcon, label: "Chat" },
  };

export function DetailView({ linkId }: { linkId: string }) {
  // Defer linkId so rapid cursor movement (held arrow / j / k) doesn't make
  // the detail subtree fire a fresh livestore query on every keystroke.
  const deferredLinkId = useDeferredValue(linkId);
  const store = useAppStore();
  const linkQuery = useMemo(() => linkById$(deferredLinkId), [deferredLinkId]);
  const link = store.useQuery(linkQuery);

  if (!link) return null;

  return <DetailViewInner link={link} />;
}

const DetailViewInner = memo(function DetailViewInner({
  link,
}: {
  link: LinkWithDetails;
}) {
  useHotkeyScope("detail");

  const store = useAppStore();
  const { closeDetail } = useRightPaneActions();
  const hasSelection = useInSelectionMode();

  useHotkeys("escape", closeDetail, {
    scopes: ["detail"],
    enableOnFormTags: ["option"],
    enabled: !hasSelection,
  });

  const processingRecord = store.useQuery(linkProcessingStatus$(link.id));
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";
  const isFailed = processingRecord?.status === "failed";

  const { tagIds, setTagIds } = useLinkTags(link.id);

  const handleReprocess = useCallback(() => {
    store.commit(
      events.linkReprocessRequested({
        linkId: link.id,
        requestedAt: new Date(),
      })
    );
  }, [store, link.id]);

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;
  const displayTitle = link.title ? decodeHtmlEntities(link.title) : link.url;
  const source = link.source && link.source !== "app" ? link.source : null;
  const sourceConfig = source ? SOURCE_CONFIG[source] : null;
  const SourceIcon = sourceConfig?.icon;

  return (
    <div className="relative flex flex-col gap-6 pt-3 pr-2 pb-8">
      <div className="aspect-video w-full overflow-hidden rounded-sm">
        <LinkPreviewImage src={link.image} loading="eager" />
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
            <span>Archived</span>
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
          {decodeHtmlEntities(link.description)}
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
});

const DetailSummary = memo(function DetailSummary({
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
});
