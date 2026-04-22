import { useNavigate } from "@tanstack/react-router";
import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";

import { AdminModal } from "@/components/admin";
import { useChatPanel } from "@/components/chat/chat-context";
import { IntegrationsModal } from "@/components/integrations";
import { TagManagerDialog } from "@/components/tags/tag-manager-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { useAuth } from "@/lib/auth";

export function DotsMenu() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { isChatEnabled } = useOrgFeatures();
  const chatPanel = useChatPanel();

  const [adminOpen, setAdminOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  const isAdmin = auth.role === "admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Menu"
              className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
            >
              <EllipsisVerticalIcon className="size-4" strokeWidth={1.75} />
            </button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-48">
          {isChatEnabled && (
            <DropdownMenuItem onClick={chatPanel.toggle}>
              Agent
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setTagManagerOpen(true)}>
            Tags
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIntegrationsOpen(true)}>
            Integrations
          </DropdownMenuItem>
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAdminOpen(true)}>
                Admin
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/brand" })}>
                Brand
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLogoutOpen(true)}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
      />
      <IntegrationsModal
        open={integrationsOpen}
        onOpenChange={setIntegrationsOpen}
      />
      <AdminModal open={adminOpen} onOpenChange={setAdminOpen} />
      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => auth.logout().then(() => window.location.reload())}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
