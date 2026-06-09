import { BlocksIcon, CreditCardIcon, TagIcon, UserIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { IntegrationsSection } from "@/components/integrations/integrations-section";
import { AccountSection } from "@/components/settings/sections/account-section";
import { PlanSection } from "@/components/settings/sections/plan-section";
import { TagsSection } from "@/components/tags/tags-section";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSettingsDialog } from "@/stores/settings-dialog-store";

export type SettingsSection = "account" | "plan" | "integrations" | "tags";

interface SectionDef {
  id: SettingsSection;
  label: string;
  Icon: typeof UserIcon;
}

const SECTIONS: readonly SectionDef[] = [
  { id: "account", label: "Account", Icon: UserIcon },
  { id: "plan", label: "Plan", Icon: CreditCardIcon },
  { id: "integrations", label: "Integrations", Icon: BlocksIcon },
  { id: "tags", label: "Tags", Icon: TagIcon },
];

const SECTION_RENDERERS: Record<SettingsSection, () => React.ReactNode> = {
  account: () => <AccountSection />,
  plan: () => <PlanSection />,
  integrations: () => <IntegrationsSection />,
  tags: () => <TagsSection />,
};

export function SettingsDialog() {
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

  const visible = SECTIONS;
  const effective: SettingsSection = visible.some((s) => s.id === active)
    ? active
    : "account";

  // Track every visited section so it stays mounted (hidden) on rail nav —
  // preserves things like the freshly-generated API key in Integrations and
  // the Tags search input.
  useEffect(() => {
    if (!open) return;
    setVisited((prev) =>
      prev.has(effective) ? prev : new Set([...prev, effective])
    );
  }, [open, effective]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        fullScreenOnMobile
        className="sm:max-w-3xl sm:h-[min(620px,85vh)] gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex h-full min-h-0 flex-col lg:flex-row">
          <div className="flex items-center border-b border-border/60 px-4 py-3 lg:hidden">
            <span className="text-sm font-medium text-foreground">
              Settings
            </span>
          </div>

          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-0.5 border-border/60 bg-muted/30 max-lg:flex-row max-lg:overflow-x-auto max-lg:border-b max-lg:p-2 lg:w-44 lg:flex-col lg:border-r lg:p-3"
          >
            {visible.map(({ id, label, Icon }) => {
              const isActive = id === effective;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActive(id)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "relative flex shrink-0 items-center gap-2 rounded-md text-left text-xs transition-colors outline-none",
                    "max-sm:size-10 max-sm:justify-center sm:px-2.5 sm:py-1.5",
                    "focus-visible:ring-2 focus-visible:ring-ring/50",
                    {
                      "font-semibold text-primary max-lg:bg-foreground/[0.06] lg:before:absolute lg:before:top-1.5 lg:before:bottom-1.5 lg:before:-left-3 lg:before:w-[2px] lg:before:rounded-r-full lg:before:bg-primary":
                        isActive,
                      "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground":
                        !isActive,
                    }
                  )}
                >
                  <Icon className="size-4 shrink-0 sm:size-3.5" />
                  <span className="grid max-sm:hidden">
                    <span
                      aria-hidden
                      className="invisible font-semibold whitespace-nowrap [grid-area:1/1]"
                    >
                      {label}
                    </span>
                    <span className="truncate [grid-area:1/1]">{label}</span>
                  </span>
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
                  className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-8 lg:py-7"
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
