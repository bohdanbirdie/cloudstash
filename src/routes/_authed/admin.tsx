import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { TopBar } from "@/components/top-bar";
import { Skeleton } from "@/components/ui/skeleton";

const AdminSection = lazy(() =>
  import("@/components/admin/admin-section").then((m) => ({
    default: m.AdminSection,
  }))
);

export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: ({ context }) => {
    if (context.auth.role !== "admin") throw redirect({ to: "/inbox" });
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="flex h-full min-h-0 flex-col px-4 pt-4 lg:px-8 lg:pt-6">
      <TopBar />
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 lg:mt-7">
        <Suspense fallback={<AdminFallback />}>
          <AdminSection />
        </Suspense>
      </div>
    </div>
  );
}

function AdminFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}
