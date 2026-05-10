import { useNavigate } from "@tanstack/react-router";
import {
  BlocksIcon,
  DownloadIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldIcon,
  TagIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AdminModal } from "@/components/admin";
import { ConnectionsModal } from "@/components/connections/connections-modal";
import { ExportDialog } from "@/components/export-dialog";
import { SettingsModal } from "@/components/settings/settings-modal";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { useAuth } from "@/lib/auth";
import type { LinkStatus } from "@/livestore/queries/filtered-links";

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

function getFirstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

export function AccountMenu() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { status: pageStatus, title: pageTitle } = usePageStaticData();

  const [adminOpen, setAdminOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isAdmin = auth.role === "admin";
  const initial = getInitial(auth.name, auth.email);
  const firstName = getFirstName(auth.name);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <DropdownMenuTrigger
                aria-label="Account menu"
                render={
                  <Avatar
                    size="sm"
                    className="cursor-pointer outline-none after:transition-colors hover:after:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-popup-open:after:border-foreground/30"
                  >
                    {auth.image && (
                      <AvatarImage
                        src={auth.image}
                        alt={auth.name ?? auth.email ?? ""}
                      />
                    )}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                }
              />
            }
          />
          <TooltipContent side="bottom" align="end">
            Account
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" sideOffset={6} className="w-40">
          {firstName && (
            <>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Avatar size="sm">
                  {auth.image && (
                    <AvatarImage src={auth.image} alt={firstName} />
                  )}
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
                <span className="truncate text-xs font-medium text-foreground">
                  {firstName}
                </span>
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTagManagerOpen(true)}>
            <TagIcon />
            Manage tags
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setConnectionsOpen(true)}>
            <BlocksIcon />
            Connections
          </DropdownMenuItem>
          {pageStatus && pageTitle && (
            <DropdownMenuItem onClick={() => setExportOpen(true)}>
              <DownloadIcon />
              Export {pageTitle.toLowerCase()}
            </DropdownMenuItem>
          )}
          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAdminOpen(true)}>
                <ShieldIcon />
                Admin
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate({ to: "/brand" })}>
                <PaletteIcon />
                Brand
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLogoutOpen(true)}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {tagManagerOpen && (
        <TagManagerDialog open onOpenChange={setTagManagerOpen} />
      )}
      {exportOpen && pageStatus && pageTitle && (
        <ExportPageDialog
          status={pageStatus}
          pageTitle={pageTitle}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}
      {connectionsOpen && (
        <ConnectionsModal open onOpenChange={setConnectionsOpen} />
      )}
      {settingsOpen && <SettingsModal open onOpenChange={setSettingsOpen} />}
      {adminOpen && <AdminModal open onOpenChange={setAdminOpen} />}
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

function ExportPageDialog({
  status,
  pageTitle,
  open,
  onOpenChange,
}: {
  status: LinkStatus;
  pageTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const links = useFilteredLinks(status);
  const ids = useMemo(() => links.map((l) => l.id), [links]);
  return (
    <ExportDialog
      open={open}
      onOpenChange={onOpenChange}
      ids={ids}
      pageTitle={pageTitle}
    />
  );
}
