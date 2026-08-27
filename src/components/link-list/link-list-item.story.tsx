import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";

import type { LinkListItem as LinkListItemData } from "@/livestore/queries/links";
import type { Tag } from "@/livestore/queries/tags";

import { LinkListItem } from "./link-list-item";

const parsedLink = {
  completedAt: null,
  createdAt: Date.UTC(2026, 7, 27, 12, 0),
  deletedAt: null,
  description: "A practical guide to building durable applications.",
  domain: "developers.cloudflare.com",
  favicon: "/favicons/vercel.png",
  id: "link-durable-workflows",
  image: "/cloudstash-og.png",
  status: "unread",
  title: "Designing resilient workflows &amp; retries",
  url: "https://developers.cloudflare.com/workflows/",
} satisfies LinkListItemData;

const rawLink = {
  ...parsedLink,
  domain: "example.com",
  favicon: null,
  id: "link-raw-url",
  image: null,
  title: null,
  url: "https://example.com/articles/durable-systems",
} satisfies LinkListItemData;

const tags = [
  {
    createdAt: Date.UTC(2026, 7, 27, 12, 0),
    deletedAt: null,
    id: "tag-engineering",
    name: "engineering",
    sortOrder: 0,
  },
  {
    createdAt: Date.UTC(2026, 7, 27, 12, 1),
    deletedAt: null,
    id: "tag-cloudflare",
    name: "cloudflare",
    sortOrder: 1,
  },
  {
    createdAt: Date.UTC(2026, 7, 27, 12, 2),
    deletedAt: null,
    id: "tag-workflows",
    name: "workflows",
    sortOrder: 2,
  },
] satisfies readonly Tag[];

type CardProps = ComponentProps<typeof LinkListItem>;

const variants = [
  { title: "Parsed title", args: {} },
  { title: "Raw link", args: { link: rawLink } },
  {
    title: "No image",
    args: { link: { ...parsedLink, image: null } },
  },
  { title: "With image", args: {} },
  {
    title: "No favicon",
    args: { link: { ...parsedLink, favicon: null } },
  },
  { title: "With favicon", args: {} },
  { title: "Active", args: { active: true } },
  { title: "Selected", args: { selected: true } },
  {
    title: "Active + selected",
    args: { active: true, selected: true },
  },
  { title: "Selection preview", args: { previewing: true } },
  { title: "Tags", args: { tags } },
  {
    title: "Long title",
    args: {
      link: {
        ...parsedLink,
        title:
          "A deliberately long article title that demonstrates how a saved link wraps and truncates inside the card",
      },
    },
  },
] satisfies ReadonlyArray<{
  title: string;
  args: Partial<CardProps>;
}>;

const meta = {
  title: "Surfaces/Links/Card",
  component: LinkListItem,
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
    active: false,
    isNew: false,
    link: parsedLink,
    onCheckboxClick: fn(),
    onClick: fn(),
    onMouseEnter: fn(),
    previewing: false,
    selected: false,
    tabbable: true,
    tags: [],
  },
} satisfies Meta<typeof LinkListItem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="overflow-hidden rounded-md border">
      {variants.map((variant) => (
        <div
          key={variant.title}
          className="grid items-stretch border-t first:border-t-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
        >
          <div className="border-b bg-muted/30 p-4 text-xs font-medium text-muted-foreground sm:border-e sm:border-b-0">
            {variant.title}
          </div>
          <div
            role="listbox"
            aria-label={`${variant.title} link card`}
            className="px-4 py-3 lg:px-7"
          >
            <LinkListItem {...args} {...variant.args} />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const NewlyAdded: Story = {
  args: {
    isNew: true,
  },
  render: (args) => (
    <div className="mx-auto max-w-2xl">
      <div role="listbox" aria-label="Newly added link card">
        <LinkListItem {...args} />
      </div>
    </div>
  ),
};
