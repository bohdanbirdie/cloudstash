import { describe, it, expect } from "vitest";

import {
  deriveNewTag,
  isValidTagName,
  MAX_TAG_NAME_LENGTH,
  sanitizeTagName,
} from "../tags";

describe("sanitizeTagName", () => {
  it("lowercases", () => {
    expect(sanitizeTagName("React")).toBe("react");
  });

  it("trims whitespace", () => {
    expect(sanitizeTagName("  foo  ")).toBe("foo");
  });

  it("replaces spaces with hyphens", () => {
    expect(sanitizeTagName("machine learning")).toBe("machine-learning");
    expect(sanitizeTagName("multi   word")).toBe("multi-word");
  });

  it("strips characters outside [a-z0-9-]", () => {
    expect(sanitizeTagName("hello!world")).toBe("helloworld");
    expect(sanitizeTagName("foo_bar")).toBe("foobar");
  });

  it("strips leading and trailing hyphens", () => {
    expect(sanitizeTagName("-foo")).toBe("foo");
    expect(sanitizeTagName("foo-")).toBe("foo");
    expect(sanitizeTagName("-foo-")).toBe("foo");
  });

  it("collapses consecutive hyphens", () => {
    expect(sanitizeTagName("foo--bar")).toBe("foo-bar");
    expect(sanitizeTagName("my---ta")).toBe("my-ta");
    expect(sanitizeTagName("---foo---bar---")).toBe("foo-bar");
  });

  it("returns empty for hyphens-only or non-alphanum input", () => {
    expect(sanitizeTagName("----")).toBe("");
    expect(sanitizeTagName("!!!")).toBe("");
  });

  it("combines all rules", () => {
    expect(sanitizeTagName("  Machine Learning! ")).toBe("machine-learning");
    expect(sanitizeTagName("-My---Tag-")).toBe("my-tag");
  });
});

describe("isValidTagName", () => {
  it("accepts a non-empty name within length limit", () => {
    expect(isValidTagName("react")).toBe(true);
    expect(isValidTagName("a".repeat(MAX_TAG_NAME_LENGTH))).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isValidTagName("")).toBe(false);
  });

  it("rejects names longer than MAX_TAG_NAME_LENGTH", () => {
    expect(isValidTagName("a".repeat(MAX_TAG_NAME_LENGTH + 1))).toBe(false);
  });
});

describe("deriveNewTag", () => {
  const noExisting = new Set<string>();

  it("returns matching id and name (both canonical)", () => {
    expect(deriveNewTag("react", noExisting)).toEqual({
      id: "react",
      name: "react",
    });
  });

  it("canonicalizes free-form input", () => {
    expect(deriveNewTag("Machine Learning", noExisting)).toEqual({
      id: "machine-learning",
      name: "machine-learning",
    });
    expect(deriveNewTag("-My---Tag-", noExisting)).toEqual({
      id: "my-tag",
      name: "my-tag",
    });
  });

  it("returns null for empty / hyphens-only / pure-special input", () => {
    expect(deriveNewTag("", noExisting)).toBeNull();
    expect(deriveNewTag("   ", noExisting)).toBeNull();
    expect(deriveNewTag("---", noExisting)).toBeNull();
    expect(deriveNewTag("!!!", noExisting)).toBeNull();
  });

  it("returns null when canonical slug collides with existing tag", () => {
    const existing = new Set(["my-tag"]);
    expect(deriveNewTag("My Tag", existing)).toBeNull();
    expect(deriveNewTag("my---tag", existing)).toBeNull();
    expect(deriveNewTag("-MY-TAG-", existing)).toBeNull();
  });

  it("returns null when canonical name exceeds MAX_TAG_NAME_LENGTH", () => {
    expect(
      deriveNewTag("a".repeat(MAX_TAG_NAME_LENGTH + 1), noExisting)
    ).toBeNull();
  });
});
