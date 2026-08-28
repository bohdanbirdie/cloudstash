import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

import { mcpCodingAgentSetup } from "./mcp-connection";

function copyStatus(copied: boolean, copyFailed: boolean): string | null {
  if (copyFailed) return "Copy failed. Select and copy manually.";
  if (copied) return "Copied";
  return null;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { copied, copy, copyFailed } = useCopyToClipboard();
  const status = copyStatus(copied, copyFailed);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-foreground">{label}</p>
        {status && (
          <p
            className={cn("text-xs text-muted-foreground", {
              "text-destructive": copyFailed,
            })}
            role="status"
          >
            {status}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-md bg-muted/60 p-1 ring-1 ring-foreground/5">
        <Input
          aria-label={`${label} value`}
          className="h-6 min-w-0 flex-1 rounded-sm border-0 bg-transparent px-1.5 py-0 font-mono text-base/6 text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs/6 dark:bg-transparent"
          readOnly
          spellCheck={false}
          value={value}
        />
        <Button
          aria-label={`Copy ${label}`}
          className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground dark:hover:bg-foreground/10"
          onClick={() => copy(value)}
          size="icon-sm"
          variant="ghost"
        >
          {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}

export function McpSetup({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-3">
      <CopyField
        label="Connect in your agent"
        value={mcpCodingAgentSetup(endpoint)}
      />

      <CopyField label="MCP server URL" value={endpoint} />
    </div>
  );
}
