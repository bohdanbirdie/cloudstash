import { LayoutGridIcon, ListIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useViewModeStore } from "@/stores/view-mode-store";

export function ViewSwitcher() {
  const { viewMode, setViewMode } = useViewModeStore();

  return (
    <TooltipProvider>
      <ToggleGroup
        value={[viewMode]}
        onValueChange={(value) => {
          const newValue = value[0] as "grid" | "list" | undefined;
          if (newValue) setViewMode(newValue);
        }}
        variant="outline"
        size="sm"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <ToggleGroupItem value="grid">
                <LayoutGridIcon className="h-4 w-4" />
              </ToggleGroupItem>
            }
          />
          <TooltipContent>Grid view</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <ToggleGroupItem value="list">
                <ListIcon className="h-4 w-4" />
              </ToggleGroupItem>
            }
          />
          <TooltipContent>List view</TooltipContent>
        </Tooltip>
      </ToggleGroup>
    </TooltipProvider>
  );
}
