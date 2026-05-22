import {
  CopyIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useFlashFlag } from "@/hooks/use-flash-flag";

interface KeyCreatedBannerProps {
  generatedKey: string;
  helperCommand?: string;
  helperLabel?: string;
  onDone: () => void;
}

export function KeyCreatedBanner({
  generatedKey,
  helperCommand,
  helperLabel,
  onDone,
}: KeyCreatedBannerProps) {
  const [keyVisible, setKeyVisible] = useState(false);
  const { active: copied, trigger: flashCopied } = useFlashFlag();
  const { active: commandCopied, trigger: flashCommandCopied } = useFlashFlag();

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(generatedKey);
    flashCopied();
  };

  const handleCopyCommand = async () => {
    if (helperCommand) {
      await navigator.clipboard.writeText(helperCommand);
      flashCommandCopied();
    }
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-card">
      <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
        <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Copy this key now. It won&apos;t be shown again.
        </AlertDescription>
      </Alert>

      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 bg-muted px-3 py-2 rounded text-xs font-mono break-all">
          {keyVisible ? generatedKey : "••••••••••••••••"}
        </code>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setKeyVisible(!keyVisible)}
          aria-label={keyVisible ? "Hide key" : "Show key"}
        >
          {keyVisible ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCopyKey}
          aria-label="Copy key"
        >
          {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
        </Button>
      </div>

      {helperCommand && (
        <div className="text-xs text-muted-foreground">
          {helperLabel}
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 min-w-0 bg-muted px-2 py-1 rounded break-all">
              {helperCommand.replace(
                generatedKey,
                keyVisible ? generatedKey : "••••••••"
              )}
            </code>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleCopyCommand}
              aria-label="Copy command"
            >
              {commandCopied ? (
                <CheckIcon className="text-green-500" />
              ) : (
                <CopyIcon />
              )}
            </Button>
          </div>
        </div>
      )}

      <Button onClick={onDone} className="w-full">
        Done
      </Button>
    </div>
  );
}
