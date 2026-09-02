import { useState } from "react";
import useSWR from "swr";

import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageLimits } from "@/components/usage/usage-limits";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { useAuth } from "@/lib/auth";
import { fetchWorkspaceUsage, usageEndpoint } from "@/lib/usage-api";
import type { UsageItem } from "@/lib/usage-api";
import { allLinksCount$ } from "@/livestore/queries/links";
import { useAppStore, useStoreQuery } from "@/livestore/store";

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

export function AccountSection() {
  const auth = useAuth();
  const { capabilities, isLoading: isLoadingFeatures } = useOrgFeatures();
  const store = useAppStore();
  const activeLinks = useStoreQuery(store, allLinksCount$);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const usageUrl = auth.orgId ? usageEndpoint(auth.orgId) : null;
  const { data: usageData, error: usageError } = useSWR(
    usageUrl,
    fetchWorkspaceUsage,
    { dedupingInterval: 30_000 }
  );

  return (
    <>
      <AccountSectionView
        email={auth.email}
        image={auth.image}
        name={auth.name}
        usageItems={usageData?.items}
        usageError={usageError instanceof Error}
        savedLinks={
          capabilities.maxSavedLinks > 0
            ? {
                id: "savedLinks",
                label: "Saved links",
                limit: capabilities.maxSavedLinks,
                remaining: Math.max(
                  0,
                  capabilities.maxSavedLinks - activeLinks
                ),
              }
            : undefined
        }
        resetsAt={usageData?.resetsAt}
        usageLoading={
          isLoadingFeatures || (usageUrl !== null && !usageData && !usageError)
        }
        onDeleteAccount={() => setDeleteOpen(true)}
      />

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}

interface AccountSectionViewProps {
  email: string | null;
  image: string | null;
  name: string | null;
  usageItems?: readonly UsageItem[];
  usageError?: boolean;
  savedLinks?: {
    readonly id: string;
    readonly label: string;
    readonly limit: number;
    readonly remaining: number;
  };
  resetsAt?: string;
  usageLoading?: boolean;
  onDeleteAccount: () => void;
}

export function AccountSectionView({
  email,
  image,
  name,
  usageItems,
  usageError = false,
  savedLinks,
  resetsAt,
  usageLoading = false,
  onDeleteAccount,
}: AccountSectionViewProps) {
  const initial = getInitial(name, email);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            {image && (
              <AvatarImage
                src={image}
                alt={name ?? ""}
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="truncate text-sm font-semibold text-foreground">
              {name ?? "—"}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {email ?? "—"}
            </div>
          </div>
        </div>

        {(usageItems || savedLinks || usageLoading || usageError) && (
          <section className="flex flex-col gap-3">
            <SectionEyebrow>Usage</SectionEyebrow>
            {usageLoading ? (
              <div className="-mx-3 rounded-xl bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
                <Skeleton className="h-1 w-full" />
              </div>
            ) : usageItems && resetsAt ? (
              <div className="-mx-3">
                <UsageLimits
                  items={usageItems}
                  libraryItems={savedLinks ? [savedLinks] : []}
                  resetsAt={resetsAt}
                />
              </div>
            ) : (
              <p
                className="text-xs text-muted-foreground"
                role={usageError ? "alert" : undefined}
              >
                Usage is temporarily unavailable.
              </p>
            )}
          </section>
        )}
      </div>

      <section className="mt-auto flex flex-col gap-3 pt-10">
        <SectionEyebrow>Danger zone</SectionEyebrow>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Permanently delete your account and all saved links. This cannot be
          undone.
        </p>
        <Button
          variant="destructive"
          className="self-start"
          onClick={onDeleteAccount}
        >
          Delete account
        </Button>
      </section>
    </div>
  );
}
