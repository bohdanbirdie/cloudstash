import { describe, expect, it } from "vitest";

import { findMatchingTag } from "../../link-processor/fuzzy-match";

const tags = [
  { id: "1", name: "TypeScript" },
  { id: "2", name: "React" },
  { id: "3", name: "machine-learning" },
  { id: "4", name: "API Design" },
] as const;

describe("findMatchingTag", () => {
  describe("exact matches", () => {
    it("returns tag on exact name match", () => {
      expect(findMatchingTag("TypeScript", tags)).toEqual(tags[0]);
    });

    it("matches case-insensitively", () => {
      expect(findMatchingTag("typescript", tags)).toEqual(tags[0]);
      expect(findMatchingTag("REACT", tags)).toEqual(tags[1]);
      expect(findMatchingTag("api design", tags)).toEqual(tags[3]);
    });

    it("trims whitespace from suggestion", () => {
      expect(findMatchingTag("  React  ", tags)).toEqual(tags[1]);
    });
  });

  describe("partial matches", () => {
    it("matches when suggestion is substring of tag name", () => {
      expect(findMatchingTag("machine", tags)).toEqual(tags[2]);
    });

    it("matches when tag name is substring of suggestion", () => {
      expect(findMatchingTag("React Native", tags)).toEqual(tags[1]);
    });

    it("partial match is case-insensitive", () => {
      expect(findMatchingTag("LEARNING", tags)).toEqual(tags[2]);
    });
  });

  describe("no matches", () => {
    it("returns null when no match found", () => {
      expect(findMatchingTag("Python", tags)).toBeNull();
    });

    it("returns null for completely unrelated suggestion", () => {
      expect(findMatchingTag("Haskell", tags)).toBeNull();
    });
  });

  describe("empty inputs", () => {
    it("returns null when tags list is empty", () => {
      expect(findMatchingTag("TypeScript", [])).toBeNull();
    });

    it("returns null for empty suggestion and empty tags", () => {
      expect(findMatchingTag("", [])).toBeNull();
    });

    it("matches first tag for empty suggestion due to substring inclusion", () => {
      expect(findMatchingTag("", tags)).toEqual(tags[0]);
    });
  });

  describe("priority", () => {
    it("prefers exact match over partial match", () => {
      const tagsWithOverlap = [
        { id: "1", name: "React Native" },
        { id: "2", name: "React" },
      ];
      expect(findMatchingTag("React", tagsWithOverlap)).toEqual(
        tagsWithOverlap[1]
      );
    });

    it("returns first partial match when multiple partials exist", () => {
      const tagsWithMultiple = [
        { id: "1", name: "frontend-react" },
        { id: "2", name: "react-native" },
      ];
      expect(findMatchingTag("react", tagsWithMultiple)).toEqual(
        tagsWithMultiple[0]
      );
    });
  });
});
