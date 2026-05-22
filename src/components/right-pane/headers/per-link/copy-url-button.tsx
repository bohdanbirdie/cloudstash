import { CheckCheck, CopyIcon } from "lucide-react";

import { IconSwap } from "@/components/right-pane/headers/icon-swap";
import { Button } from "@/components/ui/button";
import { SharedTooltipTrigger } from "@/components/ui/shared-tooltip";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export function CopyUrlButton({ url }: { url: string }) {
  const { copied, copy } = useCopyToClipboard();

  return (
    <SharedTooltipTrigger
      payload={copied ? "Copied" : "Copy URL"}
      render={
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={() => copy(url)}
          aria-label="Copy URL"
        >
          <IconSwap iconKey={copied ? "copied" : "copy"}>
            {copied ? <CheckCheck className="text-green-500" /> : <CopyIcon />}
          </IconSwap>
        </Button>
      }
    />
  );
}
