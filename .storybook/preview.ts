import "../src/styles.css";
import type { Preview } from "@storybook/react-vite";

const preview: Preview = {
  parameters: {
    layout: "centered",
    options: {
      storySort: {
        order: ["Surfaces", "Primitives", "*"],
      },
    },
  },
};

export default preview;
