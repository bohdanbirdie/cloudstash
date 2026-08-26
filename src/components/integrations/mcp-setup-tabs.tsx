import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

import { ClaudeLogo, OpenAiLogo, OpenCodeLogo } from "./integration-icons";
import { mcpClientSetups } from "./mcp-connection";

const CLIENT_LOGOS = {
  claude: <ClaudeLogo className="text-[#D97757]" />,
  codex: <OpenAiLogo className="text-foreground" />,
  opencode: <OpenCodeLogo className="text-[#211E1E] dark:text-white" />,
};

function copyFeedback(
  copied: boolean,
  copyFailed: boolean,
  instruction: string
): string {
  if (copyFailed) {
    return "Copy failed. Select the setup text and copy it manually.";
  }
  if (copied) return "Copied.";
  return instruction;
}

function SetupCommand({
  copied,
  copyFailed,
  instruction,
  onCopy,
  value,
}: {
  copied: boolean;
  copyFailed: boolean;
  instruction: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2 ring-1 ring-foreground/5">
        <code className="min-w-0 flex-1 break-all py-0.5 font-mono text-[0.6875rem] leading-relaxed text-foreground">
          {value}
        </code>
        <Button
          aria-label={copied ? "Copied setup" : "Copy setup"}
          onClick={onCopy}
          size="icon-sm"
          variant="outline"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
      <p
        className={copyFailed ? "text-destructive" : "text-muted-foreground"}
        role="status"
      >
        {copyFeedback(copied, copyFailed, instruction)}
      </p>
    </div>
  );
}

export function McpSetupTabs({ endpoint }: { endpoint: string }) {
  const { copied, copy, copyFailed } = useCopyToClipboard();
  const [copiedClient, setCopiedClient] = useState<string | null>(null);
  const setups = mcpClientSetups(endpoint);

  return (
    <Tabs defaultValue="claude">
      <TabsList className="grid w-full grid-cols-3">
        {setups.map((setup) => (
          <TabsTrigger key={setup.id} value={setup.id}>
            {CLIENT_LOGOS[setup.id]}
            {setup.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {setups.map((setup) => (
        <TabsContent key={setup.id} value={setup.id}>
          <SetupCommand
            copied={copied && copiedClient === setup.id}
            copyFailed={copyFailed && copiedClient === setup.id}
            instruction={setup.instruction}
            onCopy={() => {
              setCopiedClient(setup.id);
              copy(setup.value);
            }}
            value={setup.value}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
