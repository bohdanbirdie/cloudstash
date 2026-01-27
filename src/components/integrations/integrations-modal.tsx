import { SendIcon, CommandIcon, KeyIcon } from "lucide-react";
import { useState, useEffect } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

import { ApiKeysTab } from "./api-keys-tab";
import { TelegramTab } from "./telegram-tab";
import { useApiKeys } from "./use-api-keys";

type TabValue = "telegram" | "raycast" | "api-keys";

interface GeneratedKeyState {
  key: string;
  tab: TabValue;
}

interface IntegrationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationsModal({
  open,
  onOpenChange,
}: IntegrationsModalProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("telegram");
  const [generatedKeyState, setGeneratedKeyState] =
    useState<GeneratedKeyState | null>(null);

  const apiKeys = useApiKeys(open);

  useEffect(() => {
    if (open) {
      setGeneratedKeyState(null);
    }
  }, [open]);

  const handleGenerateKey = async (name: string): Promise<string | null> => {
    const key = await apiKeys.generateKey(name);
    if (key) {
      setGeneratedKeyState({ key, tab: activeTab });
    }
    return key;
  };

  const handleClearGeneratedKey = () => {
    setGeneratedKeyState(null);
  };

  const getGeneratedKeyForTab = (tab: TabValue): string | null =>
    generatedKeyState?.tab === tab ? generatedKeyState.key : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Integrations</DialogTitle>
          <DialogDescription>
            Connect external tools to save links from anywhere.
          </DialogDescription>
        </DialogHeader>

        {apiKeys.error && (
          <Alert variant="destructive">
            <AlertDescription>{apiKeys.error}</AlertDescription>
          </Alert>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabValue)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList variant="line">
            <TabsTrigger value="telegram">
              <SendIcon className="h-3.5 w-3.5" />
              Telegram
            </TabsTrigger>
            <Tooltip>
              <TooltipTrigger
                render={
                  <TabsTrigger value="raycast" disabled>
                    <CommandIcon className="h-3.5 w-3.5" />
                    Raycast
                  </TabsTrigger>
                }
              />
              <TooltipContent>Maybe later</TooltipContent>
            </Tooltip>
            <TabsTrigger value="api-keys">
              <KeyIcon className="h-3.5 w-3.5" />
              API Keys
            </TabsTrigger>
          </TabsList>

          <TelegramTab
            keys={apiKeys.keys}
            isLoading={apiKeys.isLoading}
            isGenerating={apiKeys.isGenerating}
            generatedKey={getGeneratedKeyForTab("telegram")}
            onGenerateKey={handleGenerateKey}
            onRevokeKey={apiKeys.revokeKey}
            onClearGeneratedKey={handleClearGeneratedKey}
          />

          <ApiKeysTab
            keys={apiKeys.keys}
            isLoading={apiKeys.isLoading}
            isGenerating={apiKeys.isGenerating}
            generatedKey={getGeneratedKeyForTab("api-keys")}
            onGenerateKey={handleGenerateKey}
            onRevokeKey={apiKeys.revokeKey}
            onClearGeneratedKey={handleClearGeneratedKey}
          />
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
