import type { Meta, StoryObj } from "@storybook/react-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "Primitives/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-96 gap-6">
      {(["default", "line"] as const).map((variant) => (
        <Tabs key={variant} defaultValue="inbox">
          <TabsList variant={variant} aria-label={`${variant} tabs`}>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
            <TabsTrigger value="archive">Archive</TabsTrigger>
          </TabsList>
          <TabsContent value="inbox">
            12 links are waiting in your inbox.
          </TabsContent>
          <TabsContent value="archive">
            Your archived links appear here.
          </TabsContent>
        </Tabs>
      ))}
    </div>
  ),
};
