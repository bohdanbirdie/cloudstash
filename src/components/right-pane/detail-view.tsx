import {
  CheckIcon,
  CodeIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  SendIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { TagCombobox } from "@/components/tags/tag-combobox/tag-combobox";
import { DotmSquare11 } from "@/components/ui/dotm-square-11";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/ui/markdown";
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
          className="inline-flex items-center gap-1 transition-colors duration-150 hover:text-foreground"
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
            <span className="inline-flex items-center gap-1">
              <CheckIcon aria-hidden="true" className="size-3" />
              Completed
            </span>
          </>
        )}
      </div>

      <h2 className="text-2xl font-bold leading-tight text-foreground text-balance">
        {titleText}
      </h2>

      {descriptionText && (
        <div className="border-l-2 border-muted-foreground/15 pl-3">
          <p className="text-sm italic leading-relaxed text-muted-foreground text-pretty">
            {descriptionText}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            &mdash; Page description
          </p>
        </div>
      )}

      <DetailSummary
        key={link.id}
        summary={link.summary}
        isProcessing={isProcessing}
        isReprocessing={isReprocessing}
        isFailed={isFailed}
      />

      <div className="flex flex-col gap-1.5">
        <SectionEyebrow>Tags</SectionEyebrow>
        <TagCombobox
          selectedTagIds={tagIds}
          onChange={setTagIds}
          placeholder="Add tags..."
          suggestions={suggestions}
          onAcceptSuggestion={handleAcceptSuggestion}
          onDismissSuggestion={handleDismissSuggestion}
        />
      </div>

      <div className="pt-2 text-xs text-muted-foreground">
        <Kbd>Esc</Kbd> to close
      </div>
    </div>
  );
});

const SUMMARY_PROSE_CLASS =
  "text-sm leading-relaxed text-pretty [&>:first-child]:mt-0 [&>:last-child]:mb-0";

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  );
}

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
  const isWorking = isProcessing || isReprocessing;

  if (!summary && !isWorking && !isFailed) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <SectionEyebrow>Summary</SectionEyebrow>
        <AnimatePresence>
          {isWorking && (
            <motion.div
              key="summary-loader"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="inline-flex"
            >
              <DotmSquare11
                size={14}
                dotSize={2}
                ariaLabel={
                  isReprocessing ? "Regenerating summary" : "Generating summary"
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {summary ? (
        <SummaryBody summary={summary} />
      ) : isWorking ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reading the page&hellip;
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Summary generation failed
        </p>
      )}
    </div>
  );
});

function SummaryBody({ summary }: { summary: string }) {
  const reduceMotion = useReducedMotion();
  const initialSummaryRef = useRef(summary);
  const [animationId, setAnimationId] = useState<number | null>(null);

  useEffect(() => {
    if (summary === initialSummaryRef.current) return;
    initialSummaryRef.current = summary;
    setAnimationId((id) => (id ?? 0) + 1);
  }, [summary]);

  if (animationId === null || reduceMotion) {
    return <Markdown className={SUMMARY_PROSE_CLASS}>{summary}</Markdown>;
  }

  return (
    <motion.div
      key={animationId}
      initial={{ filter: "blur(6px)", opacity: 0 }}
      animate={{ filter: "blur(0px)", opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Markdown className={SUMMARY_PROSE_CLASS}>{summary}</Markdown>
    </motion.div>
  );
}
