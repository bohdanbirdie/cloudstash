import { ExternalLinkIcon, SendIcon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { UpgradeCta } from "./upgrade-cta";
import { useTelegramStatus } from "./use-telegram-status";

export function TelegramCard() {
  const status = useTelegramStatus();
  const { capabilities } = useOrgFeatures();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requiresUpgrade = !status.isConnected && !capabilities.integrations;

  const botHandle = status.botUsername ? `@${status.botUsername}` : "the bot";
  const botUrl = status.botUsername
    ? `https://t.me/${status.botUsername}`
    : null;

  const handleDisconnect = async () => {
    const ok = await status.disconnect();
    if (ok) setConfirmOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendIcon className="size-3.5" />
          Telegram
        </CardTitle>
        <CardDescription>
          Save links by sending them to a Telegram bot.
        </CardDescription>
        {status.isConnected && (
          <CardAction>
            <Badge variant="outline">
              Connected · {status.count} {status.count === 1 ? "chat" : "chats"}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {status.isConnected ? (
          <>
            <p className="text-muted-foreground">
              Send any link to{" "}
              {botUrl ? (
                <a
                  href={botUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {botHandle}
                </a>
              ) : (
                botHandle
              )}{" "}
              to save it.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              {status.count > 1
                ? `Disconnect all ${status.count} chats`
                : "Disconnect"}
            </Button>
          </>
        ) : requiresUpgrade ? (
          <>
            <p className="text-muted-foreground">
              Forward links straight from chat — they land in your vault in
              seconds.
            </p>
            <UpgradeCta tier="plus" />
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Open {botHandle} — it will guide you through linking in a couple
              of taps.
            </p>
            {botUrl ? (
              <Button
                render={
                  <a href={botUrl} target="_blank" rel="noopener noreferrer">
                    Open {botHandle}
                    <ExternalLinkIcon />
                  </a>
                }
              />
            ) : (
              <Button disabled>Open the bot</Button>
            )}
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Telegram?</AlertDialogTitle>
            <AlertDialogDescription>
              This unlinks all chats from your account and revokes any keys
              created by the Telegram flow. You can reconnect anytime by
              messaging the bot again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={status.isDisconnecting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
              disabled={status.isDisconnecting}
            >
              {status.isDisconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
