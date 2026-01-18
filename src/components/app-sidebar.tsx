import { Link, useLocation } from "@tanstack/react-router"
import {
  InboxIcon,
  CheckCircle2Icon,
  ListIcon,
  Trash2Icon,
  LinkIcon,
} from "lucide-react"

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
} from "@/components/ui/sidebar"

const navItems = [
  {
    title: "Inbox",
    url: "/",
    icon: InboxIcon,
  },
  {
    title: "Completed",
    url: "/completed",
    icon: CheckCircle2Icon,
  },
  {
    title: "All Links",
    url: "/all",
    icon: ListIcon,
  },
  {
    title: "Trash",
    url: "/trash",
    icon: Trash2Icon,
  },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="bg-primary text-primary-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg">
            <LinkIcon className="size-4" />
          </div>
          <span className="font-semibold group-data-[collapsible=icon]:hidden">Link Bucket</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={location.pathname === item.url}
                    render={<Link to={item.url} />}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
