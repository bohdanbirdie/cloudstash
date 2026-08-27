import { Link } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, useId, useState } from "react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { cancelKeepsFeaturesCopy, formatRenewalDate } from "@/lib/billing-copy";
import type { PlanTier } from "@/lib/plan";
import { PLANS } from "@/lib/plan";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

import { PlanFeatureList } from "./plan-feature-list";

type NavigationElement = ReactElement<{
  readonly children?: ReactNode;
  readonly className?: string;
}>;

export interface WelcomeScreenProps {
  readonly tier: PlanTier;
  readonly isLoading: boolean;
  readonly isFallback: boolean;
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
  readonly onRetry: () => void | PromiseLike<unknown>;
  readonly onResume: (tier: PlanTier) => void | Promise<void>;
  readonly libraryLink?: NavigationElement;
}

function featuredBenefits(tier: PlanTier): readonly string[] {
  return PLANS[tier].features;
}

function stateAnnouncement({
  tier,
  isLoading,
  isFallback,
  cancelAtPeriodEnd,
}: Pick<
  WelcomeScreenProps,
  "tier" | "isLoading" | "isFallback" | "cancelAtPeriodEnd"
>): string {
  if (isLoading) return "Confirming your plan";
  if (isFallback) return "Your latest plan could not be confirmed";
  if (cancelAtPeriodEnd && tier !== "free") {
    return `${PLANS[tier].name} cancellation scheduled`;
  }
  return `Your plan is ${PLANS[tier].name}`;
}

export function WelcomeScreen({
  tier,
  isLoading,
  isFallback,
  cancelAtPeriodEnd,
  currentPeriodEnd,
  onRetry,
  onResume,
  libraryLink = <Link to="/inbox" />,
}: WelcomeScreenProps) {
  const announcement = stateAnnouncement({
    tier,
    isLoading,
    isFallback,
    cancelAtPeriodEnd,
  });

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted p-4 sm:p-6">
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-background p-5 shadow-sm sm:p-8">
        {isLoading ? (
          <LoadingNotice />
        ) : isFallback ? (
          <UnconfirmedNotice libraryLink={libraryLink} onRetry={onRetry} />
        ) : cancelAtPeriodEnd && tier !== "free" ? (
          <CanceledNotice
            tier={tier}
            periodEnd={currentPeriodEnd}
            onResume={onResume}
            libraryLink={libraryLink}
          />
        ) : (
          <Confirmation
            tier={tier}
            periodEnd={currentPeriodEnd}
            libraryLink={libraryLink}
          />
        )}
      </div>
    </main>
  );
}

function LoadingNotice() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
      <Loader2Icon
        className="size-5 animate-spin motion-reduce:animate-none"
        aria-hidden
      />
      <span className="text-sm">Confirming your plan…</span>
    </div>
  );
}

function UnconfirmedNotice({
  libraryLink,
  onRetry,
}: {
  readonly libraryLink: NavigationElement;
  readonly onRetry: () => void | PromiseLike<unknown>;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    void Promise.resolve()
      .then(onRetry)
      .finally(() => setRetrying(false));
  };

  return (
    <div className="flex flex-col gap-6 text-center">
      <span role="status" aria-live="polite" className="sr-only">
        {retrying ? "Refreshing your plan" : ""}
      </span>
      <div className="flex flex-col gap-4">
        <StatusIcon tone="neutral">
          <RefreshCwIcon className="size-5" />
        </StatusIcon>
        <div className="flex flex-col gap-2">
          <span className={cn(MICRO_LABEL, "text-muted-foreground")}>
            Confirmation delayed
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-tight">
            Refresh your plan
          </h1>
          <p className="text-pretty text-sm/6 text-muted-foreground">
            Cloudstash couldn’t load your latest billing status. Try again now,
            or check your plan in Settings later.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={handleRetry}
          disabled={retrying}
          aria-busy={retrying}
        >
          {retrying && (
            <Loader2Icon
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
          Try again
        </Button>
        <LibraryButton link={libraryLink} variant="outline" />
      </div>
    </div>
  );
}

function Confirmation({
  tier,
  periodEnd,
  libraryLink,
}: {
  readonly tier: PlanTier;
  readonly periodEnd: string | null;
  readonly libraryLink: NavigationElement;
}) {
  const plan = PLANS[tier];
  const renewalDate = formatRenewalDate(periodEnd);
  const benefitsTitleId = useId();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <StatusIcon tone="success">
          <CheckIcon className="size-6" />
        </StatusIcon>
        <div className="flex flex-col gap-2">
          <span className={cn(MICRO_LABEL, "text-muted-foreground")}>
            Plan confirmed
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-tight">
            You’re on {plan.name}
          </h1>
          <p className="text-pretty text-sm/6 text-muted-foreground">
            {plan.tagline}
          </p>
        </div>
      </header>

      <section
        className="flex flex-col gap-3"
        aria-labelledby={benefitsTitleId}
      >
        <h2
          id={benefitsTitleId}
          className="text-xs font-semibold text-muted-foreground"
        >
          Now available
        </h2>
        <PlanFeatureList features={featuredBenefits(tier)} />
      </section>

      <div className="flex flex-col gap-3">
        <LibraryButton link={libraryLink} />
        {renewalDate && tier !== "free" && (
          <p className="text-center text-xs text-muted-foreground tabular-nums">
            Renews on {renewalDate}.
          </p>
        )}
      </div>
    </div>
  );
}

function CanceledNotice({
  tier,
  periodEnd,
  onResume,
  libraryLink,
}: {
  readonly tier: PlanTier;
  readonly periodEnd: string | null;
  readonly onResume: (tier: PlanTier) => void | Promise<void>;
  readonly libraryLink: NavigationElement;
}) {
  const plan = PLANS[tier];
  const renewalDate = formatRenewalDate(periodEnd);
  const [resuming, setResuming] = useState(false);
  const endLabel = renewalDate ?? "your billing period ends";

  const handleResume = () => {
    if (resuming) return;
    setResuming(true);
    void Promise.resolve()
      .then(() => onResume(tier))
      .catch((err: unknown) => {
        setResuming(false);
        toast.error("Couldn’t open billing", {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <StatusIcon tone="neutral">
          <CalendarClockIcon className="size-5" />
        </StatusIcon>
        <div className="flex flex-col gap-2">
          <span className={cn(MICRO_LABEL, "text-muted-foreground")}>
            Cancellation scheduled
          </span>
          <h1 className="text-balance text-2xl font-bold tracking-tight tabular-nums">
            {plan.name} stays active until {endLabel}
          </h1>
          <p className="text-pretty text-sm/6 text-muted-foreground">
            {cancelKeepsFeaturesCopy(plan.name)}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <LibraryButton link={libraryLink} />
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          onClick={handleResume}
          disabled={resuming}
          aria-busy={resuming}
        >
          Resume {plan.name}
          {resuming && (
            <Loader2Icon
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({
  tone,
  children,
}: {
  readonly tone: "success" | "neutral";
  readonly children: ReactElement;
}) {
  return (
    <span
      className={cn(
        "mx-auto flex size-12 items-center justify-center rounded-full",
        {
          "bg-primary/10 text-primary": tone === "success",
          "bg-muted text-muted-foreground": tone !== "success",
        }
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

function LibraryButton({
  link,
  variant = "default",
}: {
  readonly link: NavigationElement;
  readonly variant?: "default" | "outline";
}) {
  return cloneElement(link, {
    className: cn(
      link.props.className,
      buttonVariants({ variant, size: "lg" }),
      "w-full"
    ),
    children: "Go to your library",
  });
}
