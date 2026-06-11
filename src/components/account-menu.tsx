import { useNavigate } from "@tanstack/react-router";
import {
  BlocksIcon,
  Code2Icon,
  DownloadIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  ShieldIcon,
  TagIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Drawer } from "vaul";

import { UPGRADE_ICON } from "@/components/billing/plan-icon";
import { ExportDialog } from "@/components/export-dialog";
import type { SettingsSection } from "@/components/settings/settings-dialog";
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
import { SheetHandle } from "@/components/ui/sheet-handle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFilteredLinks } from "@/hooks/use-filtered-links";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { usePageStaticData } from "@/hooks/use-page-static-data";
import { logout, useAuth } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { LinkStatus } from "@/livestore/queries/filtered-links";
import { usePaywall } from "@/stores/paywall-store";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

function getInitial(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "";
  return source.charAt(0).toUpperCase() || "?";
}

function getFirstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

interface ItemDef {
  icon: typeof SettingsIcon;
  label: string;
  onSelect: () => void;
}

type Row = { kind: "item"; item: ItemDef } | { kind: "separator" };

export function AccountMenu() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { tier } = useOrgFeatures();
  const { status: pageStatus, title: pageTitle } = usePageStaticData();
  const isNarrow = useNarrowViewport();

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isAdmin = auth.role === "admin";
  const canViewAdmin = hasPermission(auth.role, PERMISSIONS.viewDashboard);
  const initial = getInitial(auth.name, auth.email);
  const firstName = getFirstName(auth.name);

  const rows = useMemo<readonly Row[]>(() => {
    const openSettings = (section: SettingsSection) =>
      useSettingsDialog.getState().openAt(section);

    const r: Row[] = [
      {
        kind: "item",
        item: {
          icon: SettingsIcon,
          label: "Settings",
          onSelect: () => openSettings("account"),
        },
      },
      {
        kind: "item",
        item: {
          icon: TagIcon,
          label: "Manage tags",
          onSelect: () => openSettings("tags"),
        },
      },
      {
        kind: "item",
        item: {
          icon: BlocksIcon,
          label: "Integrations",
          onSelect: () => openSettings("integrations"),
        },
      },
      {
        kind: "item",
        item: {
          icon: Code2Icon,
          label: "Developers",
          onSelect: () => openSettings("developers"),
        },
      },
    ];
    if (pageStatus && pageTitle) {
      r.push({
        kind: "item",
        item: {
          icon: DownloadIcon,
          label: `Export ${pageTitle.toLowerCase()}`,
          onSelect: () => setExportOpen(true),
        },
      });
    }
    if (canViewAdmin) {
      r.push({ kind: "separator" });
      r.push({
        kind: "item",
        item: {
          icon: ShieldIcon,
          label: "Admin",
          onSelect: () => navigate({ to: "/admin" }),
        },
      });
      if (isAdmin) {
        r.push({
          kind: "item",
          item: {
            icon: PaletteIcon,
            label: "Brand",
            onSelect: () => navigate({ to: "/brand" }),
          },
        });
      }
    }
    r.push({ kind: "separator" });
    r.push({
      kind: "item",
      item: {
        icon: LogOutIcon,
        label: "Sign out",
        onSelect: () => setLogoutOpen(true),
      },
    });

    if (tier !== "pro") {
      r.unshift({ kind: "separator" });
      r.unshift({
        kind: "item",
        item: {
          icon: UPGRADE_ICON,
          label: "Upgrade",
          onSelect: () => usePaywall.getState().openPaywall(),
        },
      });
    }

    return r;
  }, [pageStatus, pageTitle, canViewAdmin, isAdmin, navigate, tier]);

  return (
    <>
      {isNarrow ? (
        <MobileSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          rows={rows}
          name={auth.name ?? auth.email ?? ""}
          firstName={firstName}
          email={auth.email}
          image={auth.image}
          initial={initial}
        />
      ) : (
        <DesktopMenu
          rows={rows}
          name={auth.name ?? auth.email ?? ""}
          firstName={firstName}
          image={auth.image}
          initial={initial}
        />
      )}

      {exportOpen && pageStatus && pageTitle && (
        <ExportPageDialog
          status={pageStatus}
          pageTitle={pageTitle}
          open={exportOpen}
          onOpenChange={setExportOpen}
        />
      )}
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
            <AlertDialogAction onClick={() => void logout()}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DesktopMenu({
  rows,
  name,
  firstName,
  image,
  initial,
}: {
  rows: readonly Row[];
  name: string;
  firstName: string | null;
  image: string | null;
  initial: string;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-label="Account menu"
              nativeButton={false}
              render={
                <Avatar
                  size="sm"
                  className="cursor-pointer outline-none after:transition-colors hover:after:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-popup-open:after:border-foreground/30"
                >
                  {image && <AvatarImage src={image} alt={name} />}
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
                {image && <AvatarImage src={image} alt={firstName} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <span className="truncate text-xs font-medium text-foreground">
                {firstName}
              </span>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {rows.map((row, i) =>
          row.kind === "separator" ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DropdownMenuItem
              key={row.item.label}
              onClick={() => row.item.onSelect()}
            >
              <row.item.icon />
              {row.item.label}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileSheet({
  open,
  onOpenChange,
  rows,
  name,
  firstName,
  email,
  image,
  initial,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  rows: readonly Row[];
  name: string;
  firstName: string | null;
  email: string | null;
  image: string | null;
  initial: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Trigger
        type="button"
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar size="sm">
          {image && <AvatarImage src={image} alt={name} />}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-background outline-none">
          <Drawer.Title className="sr-only">Account menu</Drawer.Title>
          <SheetHandle />
          {firstName && (
            <div className="flex items-center gap-3 border-b border-border/60 px-5 pt-2 pb-4">
              <Avatar size="lg">
                {image && <AvatarImage src={image} alt={firstName} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {firstName}
                </span>
                {email && (
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col py-1 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            {rows.map((row, i) =>
              row.kind === "separator" ? (
                <div key={`sep-${i}`} className="mx-3 my-1 h-px bg-border/60" />
              ) : (
                <button
                  key={row.item.label}
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    row.item.onSelect();
                  }}
                  className="flex items-center gap-3 px-5 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent active:bg-accent"
                >
                  <row.item.icon className="size-5 text-muted-foreground" />
                  {row.item.label}
                </button>
              )
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
