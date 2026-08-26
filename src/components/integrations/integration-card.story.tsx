import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { DisconnectButton, IntegrationItem } from "./integration-card";
import {
  ChromeLogo,
  McpLogo,
  RaycastLogo,
  TelegramLogo,
  XLogo,
} from "./integration-icons";

type IntegrationState =
  | "loading"
  | "upgrade"
  | "disconnected"
  | "connected"
  | "disconnecting"
  | "error";

const STATES: readonly IntegrationState[] = [
  "loading",
  "upgrade",
  "disconnected",
  "connected",
  "disconnecting",
  "error",
];

const STATE_LABELS: Record<IntegrationState, string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  disconnecting: "Disconnecting",
  error: "Error",
  loading: "Loading",
  upgrade: "Upgrade",
};

const meta = {
  title: "Surfaces/Settings/Integration cards",
  component: IntegrationItem,
  parameters: { layout: "centered" },
  args: {
    description: "Integration description",
    icon: null,
    title: "Integration",
  },
} satisfies Meta<typeof IntegrationItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StatesAndTransitions: Story = {
  render: () => <IntegrationStates />,
};

export const AllIntegrations: Story = {
  render: () => <IntegrationGroup />,
};

function IntegrationStates() {
  const [state, setState] = useState<IntegrationState>("disconnected");

  const description = {
    connected: "Send links to @cloudstash_bot",
    disconnected: "Save links from Telegram",
    disconnecting: "Send links to @cloudstash_bot",
    error: "Connection status couldn’t load",
    loading: <Skeleton className="h-3 w-40 motion-reduce:animate-none" />,
    upgrade: "Save links from Telegram",
  }[state];

  const control = {
    connected: (
      <DisconnectButton
        integration="Telegram"
        isPending={false}
        onClick={() => setState("disconnected")}
      />
    ),
    disconnected: (
      <Button size="sm" onClick={() => setState("connected")}>
        Connect
      </Button>
    ),
    disconnecting: (
      <DisconnectButton
        disabled
        integration="Telegram"
        isPending
        onClick={() => undefined}
      />
    ),
    error: (
      <Button size="sm" variant="outline" onClick={() => setState("loading")}>
        Retry
      </Button>
    ),
    loading: <Skeleton className="h-6 w-20 motion-reduce:animate-none" />,
    upgrade: <Button size="sm">Upgrade to Plus</Button>,
  }[state];

  return (
    <div className="flex w-[min(38rem,calc(100vw-2rem))] flex-col gap-3">
      <StateSelector state={state} onChange={setState} />

      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        <IntegrationItem
          control={control}
          controlKey={state}
          description={description}
          icon={<TelegramLogo />}
          iconClassName="bg-[#26A5E4]/10 text-[#229ED9]"
          title="Telegram"
        >
          {state === "error" && (
            <p className="mt-2 pl-10 text-xs text-destructive" role="alert">
              Cloudstash couldn’t reach Telegram. Try again.
            </p>
          )}
        </IntegrationItem>
      </div>
    </div>
  );
}

interface IntegrationFixture {
  connectedDescription: string;
  disconnectedAction?: string;
  disconnectedDescription: string;
  icon: React.ReactNode;
  iconClassName: string;
  supportsDisconnect: boolean;
  title: string;
  upgradeTier?: "Plus" | "Pro";
}

const INTEGRATIONS: readonly IntegrationFixture[] = [
  {
    connectedDescription: "Send links to @cloudstash_bot",
    disconnectedAction: "Connect",
    disconnectedDescription: "Save links from Telegram",
    icon: <TelegramLogo />,
    iconClassName: "bg-[#26A5E4]/10 text-[#229ED9]",
    supportsDisconnect: true,
    title: "Telegram",
    upgradeTier: "Plus",
  },
  {
    connectedDescription: "@cloudstash · New bookmarks sync automatically",
    disconnectedAction: "Connect",
    disconnectedDescription: "Sync new bookmarks from X",
    icon: <XLogo />,
    iconClassName: "bg-foreground/5 text-foreground",
    supportsDisconnect: true,
    title: "X",
    upgradeTier: "Pro",
  },
  {
    connectedDescription: "Ready to connect from an MCP client",
    disconnectedDescription: "Connect Cloudstash to any MCP client",
    icon: <McpLogo />,
    iconClassName: "bg-foreground/5 text-foreground",
    supportsDisconnect: false,
    title: "MCP",
    upgradeTier: "Pro",
  },
  {
    connectedDescription: "2 connected browsers",
    disconnectedAction: "Install",
    disconnectedDescription: "Save pages from the Chrome toolbar",
    icon: <ChromeLogo />,
    iconClassName: "bg-[#4285F4]/10 text-[#4285F4]",
    supportsDisconnect: false,
    title: "Chrome",
  },
  {
    connectedDescription: "1 connected device",
    disconnectedAction: "Install",
    disconnectedDescription: "Save links with a keyboard shortcut",
    icon: <RaycastLogo />,
    iconClassName: "bg-[#FF6363]/10 text-[#FF6363]",
    supportsDisconnect: false,
    title: "Raycast",
    upgradeTier: "Plus",
  },
];

function IntegrationGroup() {
  const [state, setState] = useState<IntegrationState>("connected");

  return (
    <div className="flex w-[min(42rem,calc(100vw-2rem))] flex-col gap-3">
      <StateSelector state={state} onChange={setState} />

      <div className="divide-y divide-border overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
        {INTEGRATIONS.map((integration) => (
          <IntegrationFixtureRow
            key={integration.title}
            integration={integration}
            state={state}
            onStateChange={setState}
          />
        ))}
      </div>
    </div>
  );
}

function IntegrationFixtureRow({
  integration,
  onStateChange,
  state,
}: {
  integration: IntegrationFixture;
  onStateChange: (state: IntegrationState) => void;
  state: IntegrationState;
}) {
  const effectiveState = (() => {
    if (state === "disconnecting" && !integration.supportsDisconnect) {
      return "connected";
    }
    if (state === "upgrade" && !integration.upgradeTier) {
      return "disconnected";
    }
    return state;
  })();

  const description = (() => {
    if (effectiveState === "loading") {
      return <Skeleton className="h-3 w-40 motion-reduce:animate-none" />;
    }
    if (effectiveState === "error") return "Connection status couldn’t load";
    if (effectiveState === "connected" || effectiveState === "disconnecting") {
      return integration.connectedDescription;
    }
    return integration.disconnectedDescription;
  })();

  const control = (() => {
    if (effectiveState === "loading") {
      return <Skeleton className="h-6 w-20 motion-reduce:animate-none" />;
    }
    if (effectiveState === "error") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStateChange("loading")}
        >
          Retry
        </Button>
      );
    }
    if (effectiveState === "upgrade" && integration.upgradeTier) {
      return <Button size="sm">Upgrade to {integration.upgradeTier}</Button>;
    }
    if (effectiveState === "disconnecting") {
      return (
        <DisconnectButton
          disabled
          integration={integration.title}
          isPending
          onClick={() => undefined}
        />
      );
    }
    if (effectiveState === "connected") {
      return integration.supportsDisconnect ? (
        <DisconnectButton
          integration={integration.title}
          isPending={false}
          onClick={() => onStateChange("disconnected")}
        />
      ) : integration.disconnectedAction ? (
        <Button size="sm" variant="ghost">
          Manage
        </Button>
      ) : undefined;
    }
    return integration.disconnectedAction ? (
      <Button size="sm" onClick={() => onStateChange("connected")}>
        {integration.disconnectedAction}
      </Button>
    ) : undefined;
  })();

  return (
    <IntegrationItem
      control={control}
      controlKey={effectiveState}
      description={description}
      icon={integration.icon}
      iconClassName={integration.iconClassName}
      title={integration.title}
    />
  );
}

function StateSelector({
  onChange,
  state,
}: {
  onChange: (state: IntegrationState) => void;
  state: IntegrationState;
}) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label="Integration state"
    >
      {STATES.map((item) => (
        <Button
          key={item}
          aria-pressed={item === state}
          size="xs"
          variant={item === state ? "secondary" : "ghost"}
          onClick={() => onChange(item)}
        >
          {STATE_LABELS[item]}
        </Button>
      ))}
    </div>
  );
}
