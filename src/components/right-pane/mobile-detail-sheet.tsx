import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  UndoIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";

import { LinkPreviewImage } from "@/components/link-preview-image";
import { DetailSummary } from "@/components/right-pane/detail-view/ai-summary";
import { DescriptionBody } from "@/components/right-pane/detail-view/description-body";
import { MetaRow } from "@/components/right-pane/detail-view/meta-row";
import { useLinkActions } from "@/components/right-pane/headers/per-link/use-link-actions";
import { Button } from "@/components/ui/button";
import { SheetHandle } from "@/components/ui/sheet-handle";
import { YouTubeFacade } from "@/components/youtube-facade";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { displayDescription, displayTitle } from "@/lib/link-display";
import { parseYouTube } from "@/lib/youtube";
import { linkById$, linkProcessingStatus$ } from "@/livestore/queries/links";
import type { LinkWithDetails } from "@/livestore/queries/links";
import { useAppStore } from "@/livestore/store";
import { useRightPaneStore } from "@/stores/right-pane-store";

const pageVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? "100%" : "-100%" }),
  center: { x: "0%" },
  exit: (dir: number) => ({ x: dir >= 0 ? "-100%" : "100%" }),
};
const pageTransition = {
  duration: 0.26,
  ease: [0.22, 1, 0.36, 1] as const,
};

const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};
const fadeTransition = { duration: 0.12 };

// Commit a page when the drag passes either a distance or a flick-velocity bar.
const SWIPE_OFFSET = 60;
const SWIPE_VELOCITY = 300;

export function MobileDetailSheet() {
  const isNarrow = useNarrowViewport();
  const activeLinkId = useRightPaneStore((s) => s.activeLinkId);
  const closeDetail = useRightPaneStore((s) => s.closeDetail);

  // Keep the last link rendered while the drawer slides closed, so the sheet
  // doesn't blank out mid-dismiss.
  const [retainedId, setRetainedId] = useState(activeLinkId);
  if (activeLinkId && activeLinkId !== retainedId) setRetainedId(activeLinkId);

  // Mounted only below `lg` — above it the right pane shows the detail. This
  // lets us run vaul as a proper modal (`modal` default `true`): real body
  // scroll-lock, tap-to-dismiss overlay, and drag-to-dismiss that correctly
  // defers to inner scroll. `modal={false}` breaks all three on touch.
  if (!isNarrow) return null;

  return (
    <Drawer.Root
      open={activeLinkId !== null}
      onOpenChange={(next) => {
        if (!next) closeDetail();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[92svh] flex-col overflow-hidden rounded-t-2xl bg-background outline-none">
          <Drawer.Title className="sr-only">Link details</Drawer.Title>
          <Drawer.Description className="sr-only">
            Swipe left or right to browse links, or tap outside to dismiss
          </Drawer.Description>
          {retainedId && <SheetContent linkId={retainedId} />}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SheetContent({ linkId }: { linkId: string }) {
  const store = useAppStore();
  const linkQuery = useMemo(() => linkById$(linkId), [linkId]);
  const link = store.useQuery(linkQuery);

  if (!link) {
    return (
      <>
        <SheetHandle />
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-8 text-center text-sm text-muted-foreground">
          This link is no longer available.
        </div>
      </>
    );
  }
  return <SheetBody link={link} />;
}

function SheetBody({ link }: { link: LinkWithDetails }) {
  const actions = useLinkActions(link);
  const closeDetail = useRightPaneStore((s) => s.closeDetail);
  const reduce = useReducedMotion();

  // `direction` drives the paged slide; set at the moment of navigation.
  const [direction, setDirection] = useState(1);
  const goPrev = () => {
    setDirection(-1);
    actions.goToPrev();
  };
  const goNext = () => {
    setDirection(1);
    actions.goToNext();
  };

  const isCompleted = link.status === "completed";
  const isDeleted = link.deletedAt !== null;

  const onPrimary = isCompleted
    ? actions.handleUncomplete
    : actions.handleComplete;
  const onSecondary = isDeleted ? actions.handleRestore : actions.handleDelete;
  const PrimaryIcon = isCompleted ? UndoIcon : CheckIcon;
  const SecondaryIcon = isDeleted ? ArchiveRestoreIcon : ArchiveIcon;
  const primaryLabel = isCompleted ? "Reopen" : "Complete";
  const secondaryLabel = isDeleted ? "Restore" : "Archive";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence custom={direction} initial={false}>
          <motion.div
            key={link.id}
            custom={direction}
            variants={reduce ? fadeVariants : pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduce ? fadeTransition : pageTransition}
            drag={reduce ? false : "x"}
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragEnd={(_, info) => {
              const { offset, velocity } = info;
              if (
                (offset.x < -SWIPE_OFFSET || velocity.x < -SWIPE_VELOCITY) &&
                actions.hasNext
              ) {
                goNext();
              } else if (
                (offset.x > SWIPE_OFFSET || velocity.x > SWIPE_VELOCITY) &&
                actions.hasPrev
              ) {
                goPrev();
              }
            }}
            data-vaul-no-drag=""
            className="absolute inset-0 overflow-y-auto overscroll-contain px-5 pt-20 pb-6"
          >
            <PageContent link={link} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute inset-x-0 top-0 z-10 border-b border-border/60 bg-background/75 backdrop-blur-md">
        <SheetHandle />
        <div className="flex items-center gap-1 px-3 pb-1">
          <Button
            variant="ghost"
            onClick={closeDetail}
            aria-label="Close"
            className="size-11 rounded-full text-muted-foreground"
          >
            <XIcon className="size-5" />
          </Button>
          <span
            className="flex-1 pl-1 text-xs text-muted-foreground tabular-nums"
            aria-label={
              actions.inList
                ? `Link ${actions.currentIndex + 1} of ${actions.listLength}`
                : undefined
            }
          >
            {actions.inList
              ? `${actions.currentIndex + 1} / ${actions.listLength}`
              : ""}
          </span>
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={!actions.hasPrev}
            aria-label="Previous link"
            className="size-11 rounded-full text-muted-foreground"
          >
            <ChevronLeftIcon className="size-5" />
          </Button>
          <Button
            variant="ghost"
            onClick={goNext}
            disabled={!actions.hasNext}
            aria-label="Next link"
            className="size-11 rounded-full text-muted-foreground"
          >
            <ChevronRightIcon className="size-5" />
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 items-stretch gap-2 border-t border-border/60 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <Button
          variant="outline"
          onClick={onSecondary}
          className="h-14 flex-1 rounded-xl bg-background text-sm font-medium"
        >
          <SecondaryIcon className="size-5" />
          {secondaryLabel}
        </Button>
        <Button
          onClick={onPrimary}
          className="h-14 flex-1 rounded-xl text-sm font-medium"
        >
          <PrimaryIcon className="size-5" />
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

function PageContent({ link }: { link: LinkWithDetails }) {
  const store = useAppStore();
  const { isAiSummaryEnabled } = useOrgFeatures();

  const processingRecord = store.useQuery(linkProcessingStatus$(link.id));
  const isProcessing = processingRecord?.status === "pending";
  const isReprocessing = processingRecord?.status === "reprocess-requested";
  const isFailed = processingRecord?.status === "failed";

  const titleText = displayTitle(link);
  const descriptionText = displayDescription(link);
  const youtube = parseYouTube(link.url);

  return (
    <>
      <div className="aspect-video w-full overflow-hidden rounded-sm">
        {youtube ? (
          <YouTubeFacade
            key={link.id}
            videoId={youtube.videoId}
            startSeconds={youtube.startSeconds}
            thumbnail={link.image}
          />
        ) : (
          <LinkPreviewImage src={link.image} loading="eager" />
        )}
      </div>

      <h2 className="mt-4 text-2xl font-bold leading-tight text-balance break-words text-foreground">
        {titleText}
      </h2>

      <div className="mt-2">
        <MetaRow link={link} />
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
            />
          }
          className="h-11 flex-1 rounded-xl bg-background text-sm font-medium"
        >
          <ExternalLinkIcon className="size-4" />
          Open
        </Button>
        <CopyChip url={link.url} />
      </div>

      {descriptionText && (
        <div className="mt-4">
          <DescriptionBody text={descriptionText} />
        </div>
      )}

      {isAiSummaryEnabled && (
        <div className="mt-6">
          <DetailSummary
            key={link.id}
            summary={link.summary}
            isProcessing={isProcessing}
            isReprocessing={isReprocessing}
            isFailed={isFailed}
          />
        </div>
      )}
    </>
  );
}

function CopyChip({ url }: { url: string }) {
  const { copied, copy } = useCopyToClipboard();
  const reduce = useReducedMotion();
  const transition = reduce
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.25, 1, 0.5, 1] as const };

  return (
    <Button
      variant="outline"
      onClick={() => copy(url)}
      className="relative h-11 flex-1 rounded-xl bg-background text-sm font-medium"
    >
      <motion.span
        aria-hidden={copied}
        initial={false}
        animate={{ opacity: copied ? 0 : 1 }}
        transition={transition}
        className="flex items-center justify-center gap-2"
      >
        <CopyIcon className="size-4" />
        Copy
      </motion.span>
      <motion.span
        aria-hidden={!copied}
        initial={false}
        animate={{ opacity: copied ? 1 : 0, scale: copied ? 1 : 0.92 }}
        transition={transition}
        className="absolute inset-0 flex items-center justify-center gap-2 text-green-600"
      >
        <CheckIcon className="size-4" />
        Copied
      </motion.span>
    </Button>
  );
}
