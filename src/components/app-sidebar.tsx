import { Link, useLocation } from "@tanstack/react-router";
import {
  InboxIcon,
  CheckCircle2Icon,
  ListIcon,
  Trash2Icon,
  LinkIcon,
  PlusIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useModifierHold } from "@/hooks/use-modifier-hold";
import { useAddLinkDialog } from "@/components/add-link-dialog";
import { useAppStore } from "@/livestore/store";
import {
  inboxCount$,
  completedCount$,
  allLinksCount$,
  trashCount$,
} from "@/livestore/queries";

export function AppSidebar() {
  const location = useLocation();
  const { open: openAddLinkDialog } = useAddLinkDialog();
  const store = useAppStore();
  const showHints = useModifierHold();

  const inboxCount = store.useQuery(inboxCount$);
  const completedCount = store.useQuery(completedCount$);
  const allLinksCount = store.useQuery(allLinksCount$);
  const { count: trashCount } = store.useQuery(trashCount$);

  const navItems = [
    {
      title: "Inbox",
      url: "/",
      icon: InboxIcon,
      count: inboxCount,
    },
    {
      title: "Completed",
      url: "/completed",
      icon: CheckCircle2Icon,
      count: completedCount,
    },
    {
      title: "All Links",
      url: "/all",
      icon: ListIcon,
      count: allLinksCount,
    },
    {
      title: "Trash",
      url: "/trash",
      icon: Trash2Icon,
      count: trashCount,
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
            Link Bucket
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
                  {showHints && (
                    <Kbd className="ml-auto group-data-[collapsible=icon]:hidden">⌘V</Kbd>
                  )}
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
      <SidebarRail />
    </Sidebar>
  );
}
