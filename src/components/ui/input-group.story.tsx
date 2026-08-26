import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopyIcon, SearchIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";
import { Kbd } from "./kbd";

const meta = {
  title: "Primitives/InputGroup",
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-lg gap-3">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput aria-label="Search" placeholder="Search links…" />
        <InputGroupAddon align="inline-end">
          <Kbd>⌘ K</Kbd>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Website address"
          defaultValue="cloudstash.app"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Copy address" size="icon-xs">
            <CopyIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>

      <InputGroup>
        <InputGroupTextarea aria-label="Note" placeholder="Add a note…" />
        <InputGroupAddon align="block-end">
          <InputGroupText>Markdown supported</InputGroupText>
          <InputGroupButton className="ml-auto">Save</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};
