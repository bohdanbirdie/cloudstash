import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./accordion";

const meta = {
  title: "Primitives/Accordion",
  component: Accordion,
} satisfies Meta<typeof Accordion>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Accordion className="w-80" defaultValue={["sync"]}>
      <AccordionItem value="sync">
        <AccordionTrigger>How does syncing work?</AccordionTrigger>
        <AccordionContent>
          Changes are synced automatically across your signed-in devices.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="offline">
        <AccordionTrigger>Can I use Cloudstash offline?</AccordionTrigger>
        <AccordionContent>
          Yes. Updates are stored locally and uploaded when you reconnect.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
