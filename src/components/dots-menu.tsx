import { useNavigate } from "@tanstack/react-router";
import {
  BlocksIcon,
  DownloadIcon,
  EllipsisVerticalIcon,
  LogOutIcon,
  PaletteIcon,
  ShieldIcon,
  TagIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { AdminModal } from "@/components/admin";
import { ConnectionsModal } from "@/components/connections/connections-modal";
import { ExportDialog } from "@/components/export-dialog";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { useAuth } from "@/lib/auth";
import type { LinkStatus } from "@/livestore/queries/filtered-links";

export function DotsMenu() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { status: pageStatus, title: pageTitle } = usePageStaticData();

  const [adminOpen, setAdminOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const isAdmin = auth.role === "admin";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Menu">
              <EllipsisVerticalIcon strokeWidth={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-48">
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

      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
      />
      {exportOpen && pageStatus && pageTitle && (
        <ExportPageDialog
          status={pageStatus}
          pageTitle={pageTitle}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}
      <ConnectionsModal
        open={connectionsOpen}
        onOpenChange={setConnectionsOpen}
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
