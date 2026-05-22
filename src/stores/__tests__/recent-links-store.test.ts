import { beforeEach, describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";

import { recentLinksCreator } from "../recent-links-store";
import type { RecentLinksState } from "../recent-links-store";

let store = createStore<RecentLinksState>(recentLinksCreator);
const links = () => store.getState().links.map((x) => x.id);

beforeEach(() => {
  store = createStore<RecentLinksState>(recentLinksCreator);
});

describe("recentLinksCreator", () => {
  describe("addLink", () => {
    it("prepends a new link id", () => {
      store.getState().addLink("link-a");
      store.getState().addLink("link-b");
      expect(links()).toEqual(["link-b", "link-a"]);
    });

    it("ignores empty id", () => {
      store.getState().addLink("");
      expect(links()).toEqual([]);
    });

    it("dedupes by id and bumps to top", () => {
      const { addLink } = store.getState();
      addLink("link-a");
      addLink("link-b");
      addLink("link-a");
      expect(links()).toEqual(["link-a", "link-b"]);
    });

    it("bumps timestamp on dedupe", async () => {
      const { addLink } = store.getState();
      addLink("link-a");
      const firstTs = store.getState().links[0].ts;
      await new Promise((r) => setTimeout(r, 2));
      addLink("link-a");
      const secondTs = store.getState().links[0].ts;
      expect(secondTs).toBeGreaterThan(firstTs);
    });

    it("caps at 10 entries (FIFO eviction)", () => {
      const { addLink } = store.getState();
      for (let i = 0; i < 14; i++) addLink(`link-${i}`);
      const all = links();
      expect(all).toHaveLength(10);
      expect(all[0]).toBe("link-13");
      expect(all[9]).toBe("link-4");
    });
  });

  describe("removeLink", () => {
    it("removes a single link by id", () => {
      const { addLink, removeLink } = store.getState();
      addLink("link-a");
      addLink("link-b");
      removeLink("link-a");
      expect(links()).toEqual(["link-b"]);
    });

    it("is a no-op when entry is not present", () => {
      const { addLink, removeLink } = store.getState();
      addLink("link-a");
      removeLink("missing");
      expect(links()).toEqual(["link-a"]);
    });
  });

  describe("clear", () => {
    it("empties the list", () => {
      const { addLink, clear } = store.getState();
      addLink("link-a");
      addLink("link-b");
      clear();
      expect(links()).toEqual([]);
    });
  });
});
