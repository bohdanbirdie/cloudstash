// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openDetail = vi.hoisted(() => vi.fn());

const savedLink = {
  id: "saved-link",
  url: "https://example.com/article",
  domain: "example.com",
  status: "unread",
  createdAt: 1,
  completedAt: null,
  deletedAt: null,
  title: "A saved article",
  description: "A useful description",
  image: "https://example.com/preview.png",
  favicon: "https://example.com/favicon.ico",
  source: null,
  summary: null,
};

vi.mock("@/livestore/queries/links", () => ({
  linkByUrl$: vi.fn(),
}));

vi.mock("@/livestore/store", () => ({
  useAppStore: () => ({ useQuery: () => savedLink }),
}));

vi.mock("@/stores/right-pane-store", () => ({
  useRightPaneStore: (
    selector: (state: { openDetail: typeof openDetail }) => unknown
  ) => selector({ openDetail }),
}));

import { LinkMention } from "@/components/ui/link-mention";

describe("saved link mentions", () => {
  afterEach(() => {
    cleanup();
    openDetail.mockReset();
  });

  it("selects the saved link instead of navigating externally", () => {
    render(<LinkMention href={savedLink.url}>{savedLink.url}</LinkMention>);

    const mention = screen.getByRole("button", {
      name: "Open A saved article in your library",
    });

    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(mention);

    expect(openDetail).toHaveBeenCalledWith(savedLink.id);
  });

  it("selects the same saved link from its preview", async () => {
    render(<LinkMention href={savedLink.url}>{savedLink.url}</LinkMention>);

    fireEvent.focus(
      screen.getByRole("button", {
        name: "Open A saved article in your library",
      })
    );

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", {
          name: "Open A saved article in your library",
        })
      ).toHaveLength(2);
    });

    const preview = screen.getAllByRole("button", {
      name: "Open A saved article in your library",
    })[1];

    fireEvent.click(preview);

    expect(openDetail).toHaveBeenCalledWith(savedLink.id);
  });
});
