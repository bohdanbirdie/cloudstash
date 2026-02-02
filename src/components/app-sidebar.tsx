import { Link, useLocation } from "@tanstack/react-router";
import {
  InboxIcon,
  CheckCircle2Icon,
  ListIcon,
  Trash2Icon,
  LinkIcon,
  PlusIcon,
  LogOutIcon,
  SearchIcon,
  PuzzleIcon,
  ShieldIcon,
  MessageSquareIcon,
} from "lucide-react";
import { useState } from "react";

import { useAddLinkDialog } from "@/components/add-link-dialog";
import { AdminModal } from "@/components/admin";
import { useChatPanel } from "@/components/chat/chat-panel";
import { IntegrationsModal } from "@/components/integrations";
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
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useOrgFeatures } from "@/hooks/use-org-features";
import { useAuth } from "@/lib/auth";
import { getHotkeyLabel } from "@/lib/hotkey-label";
import {
  inboxCount$,
  completedCount$,
  allLinksCount$,
  trashCount$,
} from "@/livestore/queries";
import { useAppStore } from "@/livestore/store";
import { useSearchStore } from "@/stores/search-store";

export function AppSidebar() {
  const location = useLocation();
  const { open: openAddLinkDialog } = useAddLinkDialog();
  const openSearch = useSearchStore((s) => s.setOpen);
  const store = useAppStore();
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const auth = useAuth();
  const { isChatEnabled } = useOrgFeatures();
  const chatPanel = useChatPanel();

  const inboxCount = store.useQuery(inboxCount$);
  const completedCount = store.useQuery(completedCount$);
  const allLinksCount = store.useQuery(allLinksCount$);
  const { count: trashCount } = store.useQuery(trashCount$);

  const navItems = [
    {
      count: inboxCount,
      icon: InboxIcon,
      title: "Inbox",
      url: "/",
    },
    {
      count: completedCount,
      icon: CheckCircle2Icon,
      title: "Completed",
      url: "/completed",
    },
    {
      count: allLinksCount,
      icon: ListIcon,
      title: "All Links",
      url: "/all",
    },
    {
      count: trashCount,
      icon: Trash2Icon,
      title: "Trash",
      url: "/trash",
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="bg-primary text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
            <LinkIcon className="size-4" />
          </div>
          <span className="font-semibold group-data-[collapsible=icon]:hidden">
            Cloudstash
          </span>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 group-data-[collapsible=icon]:hidden">
            Alpha
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Add Link"
                  onClick={() => openAddLinkDialog()}
                >
                  <PlusIcon />
                  <span>Add Link</span>
                  <Kbd className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden">
                    {getHotkeyLabel("meta+v")}
                  </Kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search"
                  onClick={() => openSearch(true)}
                >
                  <SearchIcon />
                  <span>Search</span>
                  <Kbd className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden">
                    {getHotkeyLabel("meta+k")}
                  </Kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={location.pathname === item.url}
                    render={<Link to={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                    <Badge
                      variant="secondary"
                      className="ml-auto h-5 min-w-5 px-1.5 group-data-[collapsible=icon]:hidden"
                    >
                      {item.count}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {auth.role === "admin" && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Admin"
                onClick={() => setAdminOpen(true)}
              >
                <ShieldIcon />
                <span>Admin</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {isChatEnabled && (
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Chat"
                onClick={chatPanel.open}
              >
                <MessageSquareIcon />
                <span>Chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Integrations"
              onClick={() => setIntegrationsOpen(true)}
            >
              <PuzzleIcon />
              <span>Integrations</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOutIcon />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                onClick={() =>
                  auth.logout().then(() => window.location.reload())
                }
              >
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
