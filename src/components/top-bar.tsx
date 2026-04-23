import { PlusIcon, SearchIcon } from "lucide-react";

import { useAddLinkDialog } from "@/components/add-link-dialog";
import { CategoryNav } from "@/components/category-nav";
import { CloudstashLogo } from "@/components/cloudstash-logo";
import { DotsMenu } from "@/components/dots-menu";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getHotkeyLabel } from "@/lib/hotkey-label";
import { useSearchStore } from "@/stores/search-store";

export function TopBar() {
  const { open: openAddLinkDialog } = useAddLinkDialog();
  const openSearch = useSearchStore((s) => s.toggle);

  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex items-center gap-10">
        <div className="flex items-center gap-2.5">
          <CloudstashLogo className="size-5 rounded-sm" variant="branded" />
          <span className="text-[13px] font-medium tracking-[-0.005em] text-foreground">
            cloudstash
          </span>
        </div>
        <CategoryNav />
      </div>

      <div className="flex items-center gap-4">
        <SyncStatusIndicator />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={openSearch}
                aria-label="Search"
                className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
              >
                <SearchIcon className="size-4" strokeWidth={1.75} />
              </button>
            }
          />
          <TooltipContent side="bottom" align="end">
            Search · {getHotkeyLabel("meta+k")}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => openAddLinkDialog()}
                aria-label="Add link"
                className="inline-flex size-5 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
              >
                <PlusIcon className="size-4" strokeWidth={1.75} />
              </button>
            }
          />
          <TooltipContent side="bottom" align="end">
            Add link · {getHotkeyLabel("meta+v")}
          </TooltipContent>
        </Tooltip>
        <DotsMenu />
      </div>
    </header>
  );
}
