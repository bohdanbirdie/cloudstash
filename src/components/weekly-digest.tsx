import { ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import type { DigestTriggerOutcome } from "@/components/admin/use-weekly-digest-trigger";
import { useWeeklyDigestTrigger } from "@/components/admin/use-weekly-digest-trigger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { WeeklyDigestRow } from "@/livestore/queries/weekly-digest";
import { weeklyDigests$ } from "@/livestore/queries/weekly-digest";
import { useAppStore } from "@/livestore/store";

const announceOutcome = (outcome: DigestTriggerOutcome): void => {
  switch (outcome.status) {
    case "generated":
      toast.success(`Digest generated (${outcome.linkCount} links)`);
      return;
    case "skipped-empty":
      toast.info("Skipped: no links in the last 7 days");
      return;
    case "failed":
      toast.error(`Digest failed (${outcome.reason}): ${outcome.message}`);
      return;
    case "dropped-deletion":
      toast.warning("Digest skipped: deletion in progress");
      return;
    default: {
      const _exhaustive: never = outcome;
      void _exhaustive;
    }
  }
};

const MS_PER_DAY = 86_400_000;

function isoWeekRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}

function formatPeriod(period: string, generatedAt: Date): string {
  const range = isoWeekRange(period) ?? {
    start: new Date(generatedAt.getTime() - 6 * MS_PER_DAY),
    end: generatedAt,
  };
  const sameMonth = range.start.getUTCMonth() === range.end.getUTCMonth();
  const sameYear = range.start.getUTCFullYear() === range.end.getUTCFullYear();
  const thisYear = range.end.getUTCFullYear() === new Date().getUTCFullYear();
  const startStr = range.start.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  const endStr = sameMonth
    ? String(range.end.getUTCDate())
    : range.end.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
  const yearSuffix =
    sameYear && thisYear ? "" : ` ${range.end.getUTCFullYear()}`;
  return `${startStr} – ${endStr}${yearSuffix}`;
}

const MARKDOWN_CLASS =
  "text-xs leading-relaxed text-pretty text-foreground [&_p]:text-xs [&>p:first-child]:mt-0 [&>p:last-child]:mb-0";

const ICON_MOTION = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
  exit: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
  initial: { filter: "blur(4px)", opacity: 0, scale: 0.25 },
  transition: { bounce: 0, duration: 0.3, type: "spring" as const },
};

const PastDigest = ({ digest }: { digest: WeeklyDigestRow }) => {
  const at = new Date(digest.generatedAt);
  const iso = at.toISOString();
  const periodLabel = formatPeriod(digest.period, at);
  return (
    <article>
      <h3 className="pb-1.5 text-xs font-semibold text-foreground tabular-nums">
        <time
          dateTime={iso}
          title={`${digest.period} · ${at.toLocaleString()}`}
        >
          {periodLabel}
        </time>
      </h3>
      <Markdown className={MARKDOWN_CLASS}>{digest.contentMd}</Markdown>
    </article>
  );
};

interface HistoryDialogProps {
  history: ReadonlyArray<WeeklyDigestRow>;
}

const HistoryDialog = ({ history }: HistoryDialogProps) => {
  const label = `${history.length} earlier ${history.length === 1 ? "digest" : "digests"}`;
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-[11px] tabular-nums text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label={`Show ${label}`}
          />
        }
      >
        <span>{label}</span>
        <ArrowUpRightIcon aria-hidden="true" className="size-3" />
      </DialogTrigger>
      <DialogContent
        fullScreenOnMobile
        className="flex h-[80vh] flex-col gap-0 p-0 sm:max-w-md max-sm:h-full"
      >
        <DialogHeader className="shrink-0 px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-semibold text-foreground">
            Earlier digests
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-8 px-4 pt-2 pb-6">
            {history.map((digest) => (
              <PastDigest key={digest.id} digest={digest} />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export function WeeklyDigest() {
  const store = useAppStore();
  const auth = useAuth();
  const digests = store.useQuery(weeklyDigests$);
  const latest = digests[0];
  const history = digests.slice(1);
  const canTrigger = hasPermission(auth.role, PERMISSIONS.manageSystem);
  const { isTriggering, trigger } = useWeeklyDigestTrigger();

  if (!latest && !canTrigger) return null;

  const handleTrigger = async () => {
    try {
      announceOutcome(await trigger());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trigger failed");
    }
  };

  const triggerButton = canTrigger ? (
    <Button
      size="icon-sm"
      variant="ghost"
      onClick={handleTrigger}
      disabled={isTriggering}
      aria-busy={isTriggering}
      aria-label={isTriggering ? "Generating digest…" : "Generate digest now"}
      title="Generate digest now (admin)"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {isTriggering ? (
          <motion.span key="spinner" className="inline-flex" {...ICON_MOTION}>
            <Spinner />
          </motion.span>
        ) : (
          <motion.span key="sparkles" className="inline-flex" {...ICON_MOTION}>
            <SparklesIcon />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  ) : null;

  if (!latest) {
    return (
      <section aria-labelledby="weekly-digest-title">
        <div className="flex items-center justify-between gap-2 pt-3 pb-2">
          <h2
            id="weekly-digest-title"
            className="text-xs/6 font-semibold text-muted-foreground"
          >
            Weekly digest
          </h2>
          {triggerButton}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground/60">
          Generates every Monday from links you saved that week. Use{" "}
          <SparklesIcon
            aria-hidden="true"
            className="inline size-3 -translate-y-px"
          />{" "}
          to preview one now.
        </p>
      </section>
    );
  }

  const generatedAt = new Date(latest.generatedAt);
  const generatedIso = generatedAt.toISOString();
  const periodLabel = formatPeriod(latest.period, generatedAt);

  return (
    <section aria-labelledby="weekly-digest-title">
      <div className="flex items-center justify-between gap-2 pt-3 pb-2">
        <h2
          id="weekly-digest-title"
          className="text-xs/6 font-semibold text-muted-foreground"
        >
          Weekly digest
        </h2>
        <div className="flex items-center gap-1">
          {triggerButton}
          <time
            dateTime={generatedIso}
            title={`${latest.period} · ${generatedAt.toLocaleString()}`}
            className="text-[11px] text-muted-foreground tabular-nums"
          >
            {periodLabel}
          </time>
        </div>
      </div>
      <Markdown className={MARKDOWN_CLASS}>{latest.contentMd}</Markdown>
      {history.length > 0 && (
        <div className="mt-4 flex justify-center">
          <HistoryDialog history={history} />
        </div>
      )}
    </section>
  );
}
