import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgFeatures } from "@/hooks/use-org-features";

import { DisconnectButton, IntegrationItem } from "./integration-card";
import { TelegramLogo } from "./integration-icons";
import { UpgradeCta } from "./upgrade-cta";
import { useTelegramStatus } from "./use-telegram-status";

export function TelegramCard() {
  const status = useTelegramStatus();
  const { capabilities } = useOrgFeatures();
  const requiresUpgrade = !status.isConnected && !capabilities.integrations;

  const botHandle = status.botUsername ? `@${status.botUsername}` : "the bot";
  const botUrl = status.botUsername
    ? `https://t.me/${status.botUsername}`
    : null;

  const description = (() => {
    if (status.isLoading) {
      return <Skeleton className="h-3 w-44 motion-reduce:animate-none" />;
    }
    if (status.isConnected) {
      return `Send links to ${botHandle}`;
    }
    return "Save links from Telegram";
  })();

  const actions = (() => {
    if (status.isLoading) {
      return <Skeleton className="h-6 w-20 motion-reduce:animate-none" />;
    }
    if (status.isConnected) {
      return (
        <DisconnectButton
          disabled={status.isDisconnecting}
          integration="Telegram"
          isPending={status.isDisconnecting}
          onClick={() => void status.disconnect()}
        />
      );
    }
    if (requiresUpgrade) return <UpgradeCta compact tier="plus" />;
    if (!botUrl) return <Button disabled>Open bot</Button>;
    return (
      <Button
        aria-label="Open Telegram bot"
        size="sm"
        render={
          <a href={botUrl} target="_blank" rel="noopener noreferrer">
            Open bot
            <ExternalLinkIcon />
          </a>
        }
      />
    );
  })();

  const controlState = (() => {
    if (status.isLoading) return "loading";
    if (status.isConnected) return "connected";
    if (requiresUpgrade) return "upgrade";
    return "disconnected";
  })();

  return (
    <IntegrationItem
      control={actions}
      controlKey={controlState}
      description={description}
      icon={<TelegramLogo />}
      iconClassName="bg-[#26A5E4]/10 text-[#229ED9]"
      title="Telegram"
    >
      {status.error && (
        <p className="mt-2 pl-10 text-destructive" role="alert">
          {status.error}
        </p>
      )}
    </IntegrationItem>
  );
}
