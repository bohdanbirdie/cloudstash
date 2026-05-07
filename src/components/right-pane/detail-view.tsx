import {
  AlignLeftIcon,
  CodeIcon,
  ExternalLinkIcon,
  HashIcon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { memo, useCallback, useMemo } from "react";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { TagCombobox } from "@/components/tags/tag-combobox/tag-combobox";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useLinkTags } from "@/hooks/use-link-tags";
import { useDismiss } from "@/lib/keyboard";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { suggestionTagId } from "@/lib/tags";
import { formatAgo } from "@/lib/time-ago";
import { linkById$, linkProcessingStatus$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import type { TagSuggestion } from "@/livestore/queries/schemas";
import { allTags$, pendingSuggestionsForLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

const SOURCE_CONFIG: Record<string, { icon: typeof SendIcon; label: string }> =
  {
    telegram: { icon: SendIcon, label: "Telegram" },
    api: { icon: CodeIcon, label: "API" },
    chat: { icon: MessageSquareIcon, label: "Chat" },
  };

export function DetailView({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const linkQuery = useMemo(() => linkById$(linkId), [linkId]);
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
  const closeDetail = useRightPaneStore((s) => s.closeDetail);

  useDismiss("detail", closeDetail);

  const processingRecord = store.useQuery(linkProcessingStatus$(link.id));
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";
  const isFailed = processingRecord?.status === "failed";

  const { tagIds, setTagIds } = useLinkTags(link.id);
  const suggestionsQuery = useMemo(
    () => pendingSuggestionsForLink$(link.id),
    [link.id]
  );
  const suggestions = store.useQuery(suggestionsQuery);
  const allTags = store.useQuery(allTags$);

  const handleAcceptSuggestion = useCallback(
    (s: TagSuggestion) => {
      const id = suggestionTagId(s);
      if (!s.tagId) {
        const maxSortOrder = Math.max(0, ...allTags.map((t) => t.sortOrder));
        store.commit(
          events.tagCreated({
            createdAt: new Date(),
            id,
            name: s.suggestedName,
            sortOrder: maxSortOrder + 1,
          })
        );
      }
      store.commit(
        events.linkTagged({
          createdAt: new Date(),
          id: `${link.id}-${id}`,
          linkId: link.id,
          tagId: id,
        })
      );
      store.commit(events.tagSuggestionAccepted({ id: s.id }));
    },
    [store, link.id, allTags]
  );

  const handleDismissSuggestion = useCallback(
    (s: TagSuggestion) => {
      store.commit(events.tagSuggestionDismissed({ id: s.id }));
    },
    [store]
  );

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;
  const titleText = displayTitle(link);
  const descriptionText = displayDescription(link);
  const source = link.source && link.source !== "app" ? link.source : null;
  const sourceConfig = source ? SOURCE_CONFIG[source] : null;
  const SourceIcon = sourceConfig?.icon;

  return (
    <div className="relative flex flex-col gap-6 pl-3 pb-8">
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
          <ExternalLinkIcon aria-hidden="true" className="size-3" />
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

      <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-foreground text-balance">
        {titleText}
      </h2>

      {descriptionText && (
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          {descriptionText}
        </p>
      )}

      <div className="h-px w-full bg-border" aria-hidden="true" />

      <DetailSummary
        summary={link.summary}
        isProcessing={isProcessing}
        isReprocessing={isReprocessing}
        isFailed={isFailed}
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <HashIcon className="size-3.5" />
          Tags
        </div>
        <TagCombobox
          selectedTagIds={tagIds}
          onChange={setTagIds}
          placeholder="Add tags..."
          suggestions={suggestions}
          onAcceptSuggestion={handleAcceptSuggestion}
          onDismissSuggestion={handleDismissSuggestion}
        />
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
}: {
  summary: string | null;
  isProcessing: boolean;
  isReprocessing: boolean;
  isFailed: boolean;
}) {
  if (summary) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <AlignLeftIcon className="size-3.5" />
          Summary
        </div>
        <Markdown className="text-sm leading-relaxed">{summary}</Markdown>
      </div>
    );
  }

  if (isProcessing || isReprocessing) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <AlignLeftIcon className="size-3.5" />
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
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <AlignLeftIcon className="size-3.5" />
          Summary
        </div>
        <p className="text-sm text-muted-foreground">
          Summary generation failed
        </p>
      </div>
    );
  }

  return null;
});
