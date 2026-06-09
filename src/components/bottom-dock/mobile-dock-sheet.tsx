import { Command as CommandPrimitive } from "cmdk";
import { MessageCircleIcon, SearchIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Drawer } from "vaul";

import { SheetHandle } from "@/components/ui/sheet-handle";
import { useNarrowViewport } from "@/hooks/use-narrow-viewport";
import { cn } from "@/lib/utils";
import type { LinkWithDetails, SearchResult } from "@/livestore/queries/links";
import type { DockMode } from "@/stores/dock-store";

import { DockContent } from "./dock-content";

interface MobileDockSheetProps {
  mode: DockMode;
  setMode: (mode: DockMode) => void;
  query: string;
  setQuery: (query: string) => void;
  searchResults: readonly SearchResult[];
  recentLinks: readonly LinkWithDetails[];
  onSelect: (link: LinkWithDetails | SearchResult) => void;
  orgId: string | null;
  agentEverOpened: boolean;
  agentTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onDismiss: () => void;
}

export function MobileDockSheet({
  mode,
  setMode,
  query,
  setQuery,
  searchResults,
  recentLinks,
  onSelect,
  orgId,
  agentEverOpened,
  agentTextareaRef,
  onDismiss,
}: MobileDockSheetProps) {
  const isNarrow = useNarrowViewport();

  if (!isNarrow) return null;

  return (
    <Drawer.Root
      open={mode !== "closed"}
      repositionInputs
      onOpenChange={(next) => {
        if (!next) {
          (document.activeElement as HTMLElement | null)?.blur();
          onDismiss();
        }
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[92svh] flex-col overflow-hidden rounded-t-2xl bg-background outline-none">
          <Drawer.Title className="sr-only">Search and assistant</Drawer.Title>
          <Drawer.Description className="sr-only">
            Search your links or chat with the assistant
          </Drawer.Description>
          <SheetHandle />

          <div className="mx-3 mb-2 flex shrink-0 gap-1 rounded-xl bg-muted p-1">
            <ToggleButton
              active={mode === "search"}
              onClick={() => setMode("search")}
              icon={<SearchIcon className="size-4" />}
              label="Search"
            />
            <ToggleButton
              active={mode === "agent"}
              onClick={() => setMode("agent")}
              icon={<MessageCircleIcon className="size-4" />}
              label="Agent"
            />
          </div>

          <CommandPrimitive
            shouldFilter={false}
            label="Search links"
            className="flex min-h-0 flex-1 flex-col"
          >
            {mode === "search" && (
              <label
                role="search"
                className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-4"
              >
                <SearchIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                {/* `text-base` (16px) avoids iOS Safari's focus zoom. */}
                <CommandPrimitive.Input
                  value={query}
                  onValueChange={setQuery}
                  aria-label="Search links"
                  placeholder="Search links"
                  className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                />
              </label>
            )}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <DockContent
                mode={mode}
                query={query}
                searchResults={searchResults}
                recentLinks={recentLinks}
                onSelect={onSelect}
                orgId={orgId}
                agentEverOpened={agentEverOpened}
                agentTextareaRef={agentTextareaRef}
                onClose={onDismiss}
              />
            </div>
          </CommandPrimitive>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-9 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
        {
          "bg-background text-foreground shadow-sm": active,
          "text-muted-foreground": !active,
        }
      )}
    >
      {icon}
      {label}
    </button>
  );
}
