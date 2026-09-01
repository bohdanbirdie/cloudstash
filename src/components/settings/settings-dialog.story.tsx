import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BlocksIcon,
  Code2Icon,
  CreditCardIcon,
  TagIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

import { ExtensionCard } from "@/components/integrations/extension-card";
import {
  DisconnectButton,
  IntegrationItem,
} from "@/components/integrations/integration-card";
import {
  McpLogo,
  RaycastLogo,
  TelegramLogo,
  XLogo,
} from "@/components/integrations/integration-icons";
import { IntegrationsSectionView } from "@/components/integrations/integrations-section";
import { McpSetup } from "@/components/integrations/mcp-setup";
import { AccountSectionView } from "@/components/settings/sections/account-section";
import { DevelopersSectionView } from "@/components/settings/sections/developers-section";
import { PlanSectionView } from "@/components/settings/sections/plan-section";
import { TagsSectionView } from "@/components/tags/tags-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BillingInterval, PlanTier } from "@/lib/plan";
import type { TagWithCount } from "@/livestore/queries/tags";

import { SettingsDialogSurface } from "./settings-dialog";
import type {
  SettingsDialogSurfaceSection,
  SettingsSection,
} from "./settings-dialog";

const meta = {
  title: "Surfaces/Settings/Modal",
  component: SettingsDialogSurface,
  parameters: { layout: "fullscreen" },
  args: {
    activeSection: "account",
    onActiveSectionChange: () => undefined,
    onOpenChange: () => undefined,
    open: true,
    sections: [],
  },
} satisfies Meta<typeof SettingsDialogSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Account: Story = {
  render: () => <SettingsStory initialSection="account" />,
};

export const Plan: Story = {
  render: () => <SettingsStory initialSection="plan" />,
};

export const Integrations: Story = {
  render: () => <SettingsStory initialSection="integrations" />,
};

export const Developers: Story = {
  render: () => <SettingsStory initialSection="developers" />,
};

export const Tags: Story = {
  render: () => <SettingsStory initialSection="tags" />,
};

function SettingsStory({
  initialSection,
}: {
  initialSection: SettingsSection;
}) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [open, setOpen] = useState(true);

  const sections: readonly SettingsDialogSurfaceSection[] = [
    {
      id: "account",
      label: "Account",
      Icon: UserIcon,
      content: (
        <AccountSectionView
          usageItems={[
            {
              id: "assistant",
              label: "Cloudstash Assistant",
              limit: 1_000,
              remaining: 842,
            },
          ]}
          resetsAt="2026-09-01T00:00:00.000Z"
          email="alex@example.com"
          image={null}
          name="Alex Morgan"
          onDeleteAccount={() => undefined}
        />
      ),
    },
    {
      id: "plan",
      label: "Plan",
      Icon: CreditCardIcon,
      content: <PlanFixture />,
    },
    {
      id: "integrations",
      label: "Integrations",
      Icon: BlocksIcon,
      content: <IntegrationsFixture />,
    },
    {
      id: "developers",
      label: "Developers",
      Icon: Code2Icon,
      content: <DevelopersFixture />,
    },
    {
      id: "tags",
      label: "Tags",
      Icon: TagIcon,
      content: <TagsFixture />,
    },
  ];

  return (
    <div className="grid min-h-screen place-items-center bg-muted/20 p-6">
      {!open && <Button onClick={() => setOpen(true)}>Open settings</Button>}
      <SettingsDialogSurface
        activeSection={activeSection}
        onActiveSectionChange={setActiveSection}
        onOpenChange={setOpen}
        open={open}
        sections={sections}
      />
    </div>
  );
}

function PlanFixture() {
  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>("year");
  const [pending, setPending] = useState<PlanTier | null>(null);

  return (
    <PlanSectionView
      billingInterval={null}
      cancelAtPeriodEnd={false}
      currentPeriodEnd={null}
      onChange={setPending}
      onSelectedIntervalChange={setSelectedInterval}
      pending={pending}
      selectedInterval={selectedInterval}
      tier="free"
    />
  );
}

function IntegrationsFixture() {
  return (
    <IntegrationsSectionView>
      <IntegrationItem
        control={
          <DisconnectButton
            integration="Telegram"
            isPending={false}
            onClick={() => undefined}
          />
        }
        controlKey="connected"
        description="Send links to @cloudstash_bot"
        icon={<TelegramLogo />}
        iconClassName="bg-[#26A5E4]/10 text-[#229ED9]"
        title="Telegram"
      />
      <IntegrationItem
        control={<Button size="sm">Upgrade to Pro</Button>}
        controlKey="upgrade"
        description="Sync new bookmarks from X"
        icon={<XLogo />}
        iconClassName="bg-foreground/5 text-foreground"
        title="X"
      />
      <IntegrationItem
        description="Connect Cloudstash to any MCP client"
        icon={<McpLogo />}
        iconClassName="bg-foreground/5 text-foreground"
        title="MCP"
      >
        <div className="mt-3 sm:pl-10">
          <McpSetup endpoint="https://cloudstash.app/mcp" />
        </div>
      </IntegrationItem>
      <ExtensionCard
        isLoading={false}
        keys={[]}
        onRevokeKey={async () => true}
      />
      <IntegrationItem
        control={<Skeleton className="h-6 w-20 motion-reduce:animate-none" />}
        controlKey="loading"
        description={
          <Skeleton className="h-3 w-40 motion-reduce:animate-none" />
        }
        icon={<RaycastLogo />}
        iconClassName="bg-[#FF6363]/10 text-[#FF6363]"
        title="Raycast"
      />
    </IntegrationsSectionView>
  );
}

function DevelopersFixture() {
  return (
    <DevelopersSectionView
      error={null}
      isGenerating={false}
      isLoading={false}
      keys={[
        {
          id: "key-storybook",
          name: "Raycast workflow",
          createdAt: new Date("2026-08-20T12:00:00.000Z"),
          lastRequest: new Date("2026-08-26T12:00:00.000Z"),
          source: null,
        },
      ]}
      onGenerateKey={async () => "cs_storybook_example_key"}
      onRevokeKey={async () => true}
      publicApiAvailable
    />
  );
}

const INITIAL_TAGS: readonly TagWithCount[] = [
  { id: "design", name: "design", sortOrder: 1, count: 18 },
  { id: "research", name: "research", sortOrder: 2, count: 11 },
  { id: "typescript", name: "typescript", sortOrder: 3, count: 7 },
  { id: "recipes", name: "recipes", sortOrder: 4, count: 3 },
];

function TagsFixture() {
  const [tags, setTags] = useState<readonly TagWithCount[]>(INITIAL_TAGS);

  return (
    <TagsSectionView
      tags={tags}
      onCreateTag={(tag) =>
        setTags((current) => [
          ...current,
          { ...tag, count: 0, sortOrder: current.length + 1 },
        ])
      }
      onDeleteTag={(tagId) =>
        setTags((current) => current.filter((tag) => tag.id !== tagId))
      }
      onRenameTag={(tagId, name) =>
        setTags((current) =>
          current.map((tag) =>
            tag.id === tagId ? { ...tag, id: name, name } : tag
          )
        )
      }
    />
  );
}
