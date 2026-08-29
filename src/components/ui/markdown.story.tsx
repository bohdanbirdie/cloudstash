import type { Meta, StoryObj } from "@storybook/react-vite";

import { Markdown } from "./markdown";
import type { MarkdownProps } from "./markdown";

const EXAMPLE = [
  "# Markdown specimen",
  "",
  "A compact view of the content Cloudstash can render in summaries, digests, and assistant answers.",
  "",
  "## Text and links",
  "",
  "Paragraphs support **bold text**, *emphasis*, ~~strikethrough~~, `inline code`, and [useful links](https://cloudstash.dev).",
  "",
  "> A short quotation keeps its source material distinct from the surrounding answer.",
  "",
  "## Lists",
  "",
  "- A saved guide with a short description",
  "- A longer item that wraps naturally while keeping every continuation line aligned with the text above it",
  "- A final item with **emphasis** and `inline code`",
  "",
  "1. Find the useful source",
  "2. Read the summary",
  "3. Open the original when needed",
  "",
  "- [x] Imported from the web",
  "- [ ] Ready to read later",
  "",
  "## Data",
  "",
  "| Source | Status |",
  "| --- | --- |",
  "| Telegram | Connected |",
  "| Browser | Ready |",
  "",
  "## Code",
  "",
  "```ts",
  'const result = await library.search("Lisbon");',
  "```",
  "",
  "---",
  "",
  "### Smaller heading",
  "",
  "The renderer also supports hard line breaks.  ",
  "This sentence starts on the next line.",
].join("\n");

const STORY_COMPONENTS: MarkdownProps["components"] = {
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
    >
      {children}
    </a>
  ),
};

const meta = {
  title: "Primitives/Markdown",
  component: Markdown,
  parameters: { layout: "centered" },
  args: { children: EXAMPLE },
  render: (args) => (
    <div className="w-[min(680px,calc(100vw-2rem))] rounded-lg border border-border bg-background p-6 text-foreground">
      <Markdown {...args} components={STORY_COMPONENTS} />
    </div>
  ),
} satisfies Meta<typeof Markdown>;

export default meta;

type Story = StoryObj<typeof meta>;

export const AllElements: Story = {};
