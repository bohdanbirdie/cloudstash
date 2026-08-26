import { useState } from "react";

import { SectionEyebrow } from "@/components/right-pane/detail-view/section-eyebrow";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

export function AccountSection() {
  const auth = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <AccountSectionView
        email={auth.email}
        image={auth.image}
        name={auth.name}
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
  onDeleteAccount: () => void;
}

export function AccountSectionView({
  email,
  image,
  name,
  onDeleteAccount,
}: AccountSectionViewProps) {
  const initial = getInitial(name, email);

  return (
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

      <section className="flex flex-col gap-3">
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
