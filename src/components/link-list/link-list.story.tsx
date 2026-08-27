import type { Meta, StoryObj } from "@storybook/react-vite";

import type { LinkListItem } from "@/livestore/queries/links";

import { LinkList } from "./link-list";

const links = [
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 27, 12, 0),
    deletedAt: null,
    description: "A practical guide to building durable applications.",
    domain: "effect.website",
    favicon: null,
    id: "link-effect",
    image: null,
    status: "unread",
    title: "The Effect guide",
    url: "https://effect.website/docs",
  },
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 26, 9, 30),
    deletedAt: null,
    description: "Platform documentation for Cloudflare Workers.",
    domain: "developers.cloudflare.com",
    favicon: null,
    id: "link-cloudflare",
    image: null,
    status: "unread",
    title: "Cloudflare Workers documentation",
    url: "https://developers.cloudflare.com/workers/",
  },
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 25, 18, 15),
    deletedAt: null,
    description: null,
    domain: "stripe.com",
    favicon: null,
    id: "link-stripe",
    image: null,
    status: "unread",
    title: "Designing a subscription integration",
    url: "https://stripe.com/docs/billing",
  },
  {
    completedAt: null,
    createdAt: Date.UTC(2026, 7, 24, 8, 45),
    deletedAt: null,
    description: null,
    domain: "example.com",
    favicon: null,
    id: "link-untitled",
    image: null,
    status: "unread",
    title: null,
    url: "https://example.com/reference",
  },
] satisfies readonly LinkListItem[];

const meta = {
  title: "Surfaces/Links/List",
  component: LinkList,
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
  args: {
    emptyMessage: "No links saved yet",
    links: [],
    listKey: "storybook",
    showPasteHint: true,
  },
} satisfies Meta<typeof LinkList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const OneItem: Story = {
  args: {
    links: links.slice(0, 1),
  },
};

export const SeveralItems: Story = {
  args: {
    links,
  },
};
