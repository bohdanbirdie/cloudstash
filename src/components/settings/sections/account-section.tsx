import { useState } from "react";
import useSWR from "swr";

import type { AssistantCreditStatus } from "@/cf-worker/chat-agent/usage";
import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageLimits } from "@/components/usage/usage-limits";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { useAuth } from "@/lib/auth";
import {
  chatSessionsEndpoint,
  fetchChatSessions,
} from "@/lib/chat-sessions-api";

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

export function AccountSection() {
  const auth = useAuth();
  const { isChatEnabled, isLoading: isLoadingFeatures } = useOrgFeatures();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const usageUrl =
    isChatEnabled && auth.orgId ? chatSessionsEndpoint(auth.orgId) : null;
  const { data: chatData, error: chatError } = useSWR(
    usageUrl,
    fetchChatSessions,
    { dedupingInterval: 30_000 }
  );

  return (
    <>
      <AccountSectionView
        email={auth.email}
        image={auth.image}
        name={auth.name}
        assistantCredits={chatData?.assistantCredits}
        assistantCreditsError={chatError instanceof Error}
        showAssistantCredits={isChatEnabled}
        usageLoading={
          isLoadingFeatures || (usageUrl !== null && !chatData && !chatError)
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
  assistantCredits?: AssistantCreditStatus;
  assistantCreditsError?: boolean;
  showAssistantCredits?: boolean;
  usageLoading?: boolean;
  onDeleteAccount: () => void;
}

export function AccountSectionView({
  email,
  image,
  name,
  assistantCredits,
  assistantCreditsError = false,
  showAssistantCredits = false,
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

        {(showAssistantCredits || usageLoading) && (
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
            ) : assistantCredits ? (
              <div className="-mx-3">
                <UsageLimits
                  items={[
                    {
                      id: "assistant",
                      label: "Cloudstash Assistant",
                      limit: assistantCredits.limit,
                      remaining: assistantCredits.remaining,
                    },
                  ]}
                  resetsAt={assistantCredits.resetsAt}
                />
              </div>
            ) : (
              <p
                className="text-xs text-muted-foreground"
                role={assistantCreditsError ? "alert" : undefined}
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
