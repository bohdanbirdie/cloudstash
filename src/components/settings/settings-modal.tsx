import { useState } from "react";

import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const auth = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const initial = getInitial(auth.name, auth.email);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-6 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {auth.image && (
                <AvatarImage src={auth.image} alt={auth.name ?? ""} />
              )}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="truncate text-sm font-semibold text-foreground">
                {auth.name ?? "—"}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {auth.email ?? "—"}
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-1.5">
            <SectionEyebrow>Plan</SectionEyebrow>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium text-foreground">Free</span>
              <span className="text-xs text-muted-foreground">
                Pro coming soon
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionEyebrow>Danger zone</SectionEyebrow>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Permanently delete your account and all saved links. This cannot
              be undone.
            </p>
            <Button
              variant="destructive"
              className="self-start"
              onClick={() => setDeleteOpen(true)}
            >
              Delete account
            </Button>
          </section>
        </DialogContent>
      </Dialog>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
