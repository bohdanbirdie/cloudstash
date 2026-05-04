import { CircleHelpIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const AgentHelpHint = () => (
  <Tooltip>
    <TooltipTrigger
      render={
        <button
          type="button"
          aria-label="About the assistant"
          className="flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
        >
          <CircleHelpIcon className="size-3" />
        </button>
      }
    />
    <TooltipContent side="bottom" align="end" className="max-w-[14rem]">
      Ask me to save, search, or summarize your links.
    </TooltipContent>
  </Tooltip>
);
