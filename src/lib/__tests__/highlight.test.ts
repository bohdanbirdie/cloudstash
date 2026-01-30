import { describe, it, expect } from "vitest";

import { getHighlightParts } from "../highlight";

describe("getHighlightParts", () => {
  it("returns single unhighlighted part when no match", () => {
    const result = getHighlightParts("Hello World", "xyz");

    expect(result).toEqual([{ text: "Hello World", highlighted: false }]);
  });

  it("highlights matching text (case-insensitive)", () => {
    const result = getHighlightParts("Hello World", "world");

    expect(result).toEqual([
      { text: "Hello ", highlighted: false },
      { text: "World", highlighted: true },
    ]);
  });

  it("highlights at the beginning of text", () => {
    const result = getHighlightParts("Hello World", "hello");

    expect(result).toEqual([
      { text: "Hello", highlighted: true },
      { text: " World", highlighted: false },
    ]);
  });

  it("highlights multiple occurrences", () => {
    const result = getHighlightParts("foo bar foo", "foo");

    expect(result).toEqual([
      { text: "foo", highlighted: true },
      { text: " bar ", highlighted: false },
      { text: "foo", highlighted: true },
    ]);
  });

  it("handles empty query - returns full text unhighlighted", () => {
    const result = getHighlightParts("Hello World", "");

    expect(result).toEqual([{ text: "Hello World", highlighted: false }]);
  });

  it("handles whitespace-only query", () => {
    const result = getHighlightParts("Hello World", "   ");

    expect(result).toEqual([{ text: "Hello World", highlighted: false }]);
  });

  it("handles null text", () => {
    const result = getHighlightParts(null, "test");

    expect(result).toEqual([{ text: "", highlighted: false }]);
  });

  it("handles undefined text", () => {
    const result = getHighlightParts(undefined, "test");

    expect(result).toEqual([{ text: "", highlighted: false }]);
  });

  it("handles empty text", () => {
    const result = getHighlightParts("", "test");

    expect(result).toEqual([{ text: "", highlighted: false }]);
  });

  it("escapes regex special characters in query", () => {
    const result = getHighlightParts("Price is $10.00", "$10.00");

    expect(result).toEqual([
      { text: "Price is ", highlighted: false },
      { text: "$10.00", highlighted: true },
    ]);
  });

  it("escapes all regex special chars: .*+?^${}()|[]\\", () => {
    const text = "Test [brackets] and (parens)";
    const result = getHighlightParts(text, "[brackets]");

    expect(result).toEqual([
      { text: "Test ", highlighted: false },
      { text: "[brackets]", highlighted: true },
      { text: " and (parens)", highlighted: false },
    ]);
  });

  it("preserves original case in output", () => {
    const result = getHighlightParts("GitHub Repository", "github");

    expect(result).toEqual([
      { text: "GitHub", highlighted: true },
      { text: " Repository", highlighted: false },
    ]);
  });

  it("handles query that matches entire text", () => {
    const result = getHighlightParts("Hello", "Hello");

    expect(result).toEqual([{ text: "Hello", highlighted: true }]);
  });

  it("handles consecutive matches", () => {
    const result = getHighlightParts("aaa", "a");

    expect(result).toEqual([
      { text: "a", highlighted: true },
      { text: "a", highlighted: true },
      { text: "a", highlighted: true },
    ]);
  });
});
