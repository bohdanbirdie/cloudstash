import { memo, useCallback, useMemo } from "react";

import { DesktopYouTubeSlot } from "@/components/desktop-youtube-slot";
import { LinkPreviewImage } from "@/components/link-preview-image";
import { TagCombobox } from "@/components/tags/tag-combobox/tag-combobox";
import { Kbd } from "@/components/ui/kbd";
import { useHotkeyScope } from "@/hooks/use-hotkey-scope";
import { useLinkTags } from "@/hooks/use-link-tags";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { PROMOTE_PAID_FEATURES } from "@/lib/feature-promotion";
import { useDismiss } from "@/lib/keyboard";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { suggestionTagId } from "@/lib/tags";
import { parseYouTube } from "@/lib/youtube";
import { linkById$, linkProcessingStatus$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import type { TagSuggestion } from "@/livestore/queries/schemas";
import { allTags$, pendingSuggestionsForLink$ } from "@/livestore/queries/tags";
import { events } from "@/livestore/schema";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

import { DetailSummary } from "./ai-summary";
import { AiSummaryPromo } from "./ai-summary-promo";
import { DescriptionBody } from "./description-body";
import { MetaRow } from "./meta-row";
import { SectionEyebrow } from "./section-eyebrow";

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

  const { isAiSummaryEnabled } = useOrgFeatures();

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

  const titleText = displayTitle(link);
  const descriptionText = displayDescription(link);
  const youtube = parseYouTube(link.url);

  return (
    <div className="relative flex flex-col gap-6 pl-3 pb-8">
      <div className="aspect-video w-full overflow-hidden rounded-sm">
        {youtube ? (
          <DesktopYouTubeSlot
            linkId={link.id}
            videoId={youtube.videoId}
            startSeconds={youtube.startSeconds}
            thumbnail={link.image}
          />
        ) : (
          <LinkPreviewImage src={link.image} loading="eager" />
        )}
      </div>

      <MetaRow link={link} />

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold leading-tight text-foreground text-balance">
          {titleText}
        </h2>
        {descriptionText && <DescriptionBody text={descriptionText} />}
      </div>

      {isAiSummaryEnabled ? (
        <DetailSummary
          key={link.id}
          summary={link.summary}
          isProcessing={isProcessing}
          isReprocessing={isReprocessing}
          isFailed={isFailed}
        />
      ) : PROMOTE_PAID_FEATURES ? (
        <AiSummaryPromo />
      ) : null}

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
