import {
  BlocksIcon,
  CreditCardIcon,
  ShieldIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AdminSection } from "@/components/admin/admin-section";
import { ConnectionsSection } from "@/components/connections/connections-section";
import { AccountSection } from "@/components/settings/sections/account-section";
import { PlanSection } from "@/components/settings/sections/plan-section";
import { TagsSection } from "@/components/tags/tags-section";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

export type SettingsSection =
  | "account"
  | "plan"
  | "connections"
  | "tags"
  | "admin";

interface SectionDef {
  id: SettingsSection;
  label: string;
  Icon: typeof UserIcon;
  adminOnly?: boolean;
}

const SECTIONS: readonly SectionDef[] = [
  { id: "account", label: "Account", Icon: UserIcon },
  { id: "plan", label: "Plan", Icon: CreditCardIcon },
  { id: "connections", label: "Connections", Icon: BlocksIcon },
  { id: "tags", label: "Tags", Icon: TagIcon },
  { id: "admin", label: "Admin", Icon: ShieldIcon, adminOnly: true },
];

const SECTION_RENDERERS: Record<SettingsSection, () => React.ReactNode> = {
  account: () => <AccountSection />,
  plan: () => <PlanSection />,
  connections: () => <ConnectionsSection />,
  tags: () => <TagsSection />,
  admin: () => <AdminSection />,
};

export function SettingsDialog() {
  const auth = useAuth();
  const isAdmin = auth.role === "admin";

  const open = useSettingsDialog((s) => s.open);
  const section = useSettingsDialog((s) => s.section);
  const setOpen = useSettingsDialog((s) => s.setOpen);

  const [active, setActive] = useState<SettingsSection>(section);
  const [visited, setVisited] = useState<ReadonlySet<SettingsSection>>(
    () => new Set([section])
  );

  // Sync local active state when the store directs us to a section (e.g. a
  // paywall promo deep-links to "plan" while the dialog is already open).
  useEffect(() => {
    if (open) setActive(section);
  }, [open, section]);

  // Reset visited tracking when the dialog closes so we don't keep stale
  // sections mounted across separate opens.
  useEffect(() => {
    if (!open) setVisited(new Set());
  }, [open]);

  const visible = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const effective: SettingsSection = visible.some((s) => s.id === active)
    ? active
    : "account";

  // Track every visited section so it stays mounted (hidden) on rail nav —
  // preserves things like the freshly-generated API key in Connections, the
  // Tags search input, the Admin sub-tab choice.
  useEffect(() => {
    if (!open) return;
    setVisited((prev) =>
      prev.has(effective) ? prev : new Set([...prev, effective])
    );
  }, [open, effective]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl h-[min(620px,85vh)] gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-full min-h-0">
          <nav
            aria-label="Settings sections"
            className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border/60 bg-muted/30 p-3"
          >
            {visible.map(({ id, label, Icon }) => {
              const isActive = id === effective;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive(id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring/50",
                    isActive
                      ? "font-semibold text-primary before:absolute before:top-1.5 before:bottom-1.5 before:-left-3 before:w-[2px] before:rounded-r-full before:bg-primary"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {visible.map(({ id }) => {
              if (!visited.has(id)) return null;
              const isActive = id === effective;
              return (
                <div
                  key={id}
                  aria-hidden={!isActive}
                  hidden={!isActive}
                  className="min-h-0 flex-1 overflow-y-auto px-8 py-7"
                >
                  {SECTION_RENDERERS[id]()}
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
