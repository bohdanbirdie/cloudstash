// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTypingEvent, topmostScope } from "../keyboard";

function evt(
  target: HTMLElement | null,
  init: Partial<KeyboardEventInit> & { key: string }
): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { bubbles: true, ...init });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

describe("topmostScope", () => {
  it("popover wins over everything", () => {
    expect(
      topmostScope(["global", "detail", "selection", "dialog", "popover"])
    ).toBe("popover");
  });

  it("dialog wins below popover", () => {
    expect(topmostScope(["global", "detail", "selection", "dialog"])).toBe(
      "dialog"
    );
  });

  it("dock wins below dialog", () => {
    expect(topmostScope(["global", "detail", "selection", "dock"])).toBe(
      "dock"
    );
  });

  it("selection wins below dock", () => {
    expect(topmostScope(["global", "detail", "selection"])).toBe("selection");
  });

  it("detail wins below selection", () => {
    expect(topmostScope(["global", "detail"])).toBe("detail");
  });

  it("global is the floor", () => {
    expect(topmostScope(["global"])).toBe("global");
  });

  it("returns null when nothing is active", () => {
    expect(topmostScope([])).toBe(null);
  });

  it("ignores unknown scopes", () => {
    expect(topmostScope(["global", "unknown"])).toBe("global");
  });
});

describe("isTypingEvent", () => {
  it("bare letter in <input> is typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "j" }))).toBe(true);
  });

  it("bare letter in <textarea> is typing", () => {
    const ta = document.createElement("textarea");
    expect(isTypingEvent(evt(ta, { key: "k" }))).toBe(true);
  });

  it("bare letter in contentEditable is typing", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingEvent(evt(div, { key: "a" }))).toBe(true);
  });

  it("bare letter on <body> is not typing", () => {
    expect(isTypingEvent(evt(document.body, { key: "j" }))).toBe(false);
  });

  it("bare letter on a <button> is not typing", () => {
    const btn = document.createElement("button");
    expect(isTypingEvent(evt(btn, { key: "j" }))).toBe(false);
  });

  it("space in <input> is typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: " " }))).toBe(true);
  });

  it("shift+letter in <input> is typing (capital letters)", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "J", shiftKey: true }))).toBe(true);
  });

  it("meta+letter in <input> is not typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "k", metaKey: true }))).toBe(false);
  });

  it("ctrl+letter in <input> is not typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "k", ctrlKey: true }))).toBe(false);
  });

  it("alt+letter in <input> is not typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "k", altKey: true }))).toBe(false);
  });

  it("multi-character keys (Escape, ArrowUp, Enter) are not typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "Escape" }))).toBe(false);
    expect(isTypingEvent(evt(input, { key: "ArrowUp" }))).toBe(false);
    expect(isTypingEvent(evt(input, { key: "Enter" }))).toBe(false);
    expect(isTypingEvent(evt(input, { key: "Tab" }))).toBe(false);
  });

  it("IME composition is not typing", () => {
    const input = document.createElement("input");
    expect(isTypingEvent(evt(input, { key: "a", isComposing: true }))).toBe(
      false
    );
  });

  it("missing target is not typing", () => {
    expect(isTypingEvent(evt(null, { key: "j" }))).toBe(false);
  });
});
