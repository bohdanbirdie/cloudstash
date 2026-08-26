import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArchiveIcon, SearchIcon, SettingsIcon } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "./command";

const meta = {
  title: "Primitives/Command",
  component: Command,
} satisfies Meta<typeof Command>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Command className="w-80 border shadow-sm">
      <CommandInput
        aria-label="Search commands"
        placeholder="Search commands…"
      />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem>
            <SearchIcon aria-hidden="true" />
            Search links
            <CommandShortcut>⌘K</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <ArchiveIcon aria-hidden="true" />
            Open archive
          </CommandItem>
          <CommandItem>
            <SettingsIcon aria-hidden="true" />
            Open settings
            <CommandShortcut>⌘,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
