import type { Meta, StoryObj } from "@storybook/react-vite";
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

const meta = {
  title: "Surfaces/Links/Card",
  component: LinkListItem,
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-2xl p-6">
        <div role="listbox" aria-label="Saved links">
          <Story />
        </div>
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

export const ParsedTitle: Story = {};

export const RawLink: Story = {
  args: {
    link: rawLink,
  },
};

export const WithoutImage: Story = {
  args: {
    link: { ...parsedLink, image: null },
  },
};

export const WithImage: Story = {};

export const WithoutFavicon: Story = {
  args: {
    link: { ...parsedLink, favicon: null },
  },
};

export const WithFavicon: Story = {};

export const Active: Story = {
  args: {
    active: true,
  },
};

export const Selected: Story = {
  args: {
    selected: true,
  },
};

export const ActiveAndSelected: Story = {
  args: {
    active: true,
    selected: true,
  },
};

export const SelectionPreview: Story = {
  args: {
    previewing: true,
  },
};

export const WithTags: Story = {
  args: {
    tags,
  },
};

export const LongTitle: Story = {
  args: {
    link: {
      ...parsedLink,
      title:
        "A deliberately long article title that demonstrates how a saved link wraps and truncates inside the card",
    },
  },
};

export const NewlyAdded: Story = {
  args: {
    isNew: true,
  },
};
