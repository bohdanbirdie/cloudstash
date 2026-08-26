import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./field";
import { Input } from "./input";

const meta = {
  title: "Primitives/Field",
  component: Field,
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <FieldGroup className="w-[28rem] max-w-[calc(100vw-2rem)]">
      <Field>
        <FieldLabel htmlFor="field-email">Email</FieldLabel>
        <Input id="field-email" type="email" placeholder="you@example.com" />
        <FieldDescription>
          We’ll only use this for account updates.
        </FieldDescription>
      </Field>

      <Field orientation="horizontal">
        <FieldLabel htmlFor="field-name">Display name</FieldLabel>
        <Input id="field-name" defaultValue="Ada Lovelace" />
      </Field>

      <Field data-invalid="true">
        <FieldLabel htmlFor="field-handle">Handle</FieldLabel>
        <Input
          id="field-handle"
          defaultValue="a"
          aria-invalid="true"
          aria-describedby="field-handle-error"
        />
        <FieldError id="field-handle-error">
          Handle must be at least three characters.
        </FieldError>
      </Field>

      <Field data-disabled="true">
        <FieldLabel htmlFor="field-team">Team</FieldLabel>
        <Input id="field-team" defaultValue="Cloudstash" disabled />
      </Field>
    </FieldGroup>
  ),
};
