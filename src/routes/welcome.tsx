import { createFileRoute, redirect } from "@tanstack/react-router";

import { WelcomeScreen } from "@/components/billing/welcome-screen";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { loadAuth } from "@/lib/auth";
import { changePlan } from "@/lib/billing";

export const Route = createFileRoute("/welcome")({
  beforeLoad: async () => {
    const auth = await loadAuth();
    if (!auth?.isAuthenticated) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [
      { title: "Welcome — Cloudstash" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WelcomePage,
});

function WelcomePage() {
  const {
    tier,
    isLoading,
    isFallback,
    cancelAtPeriodEnd,
    currentPeriodEnd,
    retry,
  } = useOrgFeatures();

  return (
    <WelcomeScreen
      tier={tier}
      isLoading={isLoading}
      isFallback={isFallback}
      cancelAtPeriodEnd={cancelAtPeriodEnd}
      currentPeriodEnd={currentPeriodEnd}
      onRetry={() => retry()}
      onResume={(targetTier) => changePlan(targetTier, targetTier)}
    />
  );
}
