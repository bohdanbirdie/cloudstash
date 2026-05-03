import { CheckCheck, CopyIcon } from "lucide-react";

import { IconSwap } from "@/components/right-pane/headers/icon-swap";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFlashFlag } from "@/hooks/use-flash-flag";

export function CopyUrlButton({ url }: { url: string }) {
  const { active: copied, trigger: flash } = useFlashFlag();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    flash();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={handleCopy}
            aria-label="Copy URL"
          >
            <IconSwap iconKey={copied ? "copied" : "copy"}>
              {copied ? (
                <CheckCheck className="text-green-500" />
              ) : (
                <CopyIcon />
              )}
            </IconSwap>
          </Button>
        }
      />
      <TooltipContent>{copied ? "Copied" : "Copy URL"}</TooltipContent>
    </Tooltip>
  );
}
