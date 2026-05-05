// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { INPUT_MODE_ATTR, isKeyboardMode, useInputMode } from "../input-mode";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute(INPUT_MODE_ATTR);
});

describe("isKeyboardMode", () => {
  it("returns false when the attribute is unset", () => {
    expect(isKeyboardMode()).toBe(false);
  });

  it("returns true only when the attribute is exactly 'keyboard'", () => {
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "keyboard");
    expect(isKeyboardMode()).toBe(true);
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "mouse");
    expect(isKeyboardMode()).toBe(false);
  });
});

describe("useInputMode", () => {
  it("flips the attribute to 'keyboard' on keydown", () => {
    renderHook(() => useInputMode());
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(document.documentElement.getAttribute(INPUT_MODE_ATTR)).toBe(
      "keyboard"
    );
  });

  it("flips the attribute to 'mouse' on pointermove", () => {
    renderHook(() => useInputMode());
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "keyboard");
    window.dispatchEvent(new PointerEvent("pointermove"));
    expect(document.documentElement.getAttribute(INPUT_MODE_ATTR)).toBe(
      "mouse"
    );
  });

  it("attaches listeners only once when called from multiple components", () => {
    const a = renderHook(() => useInputMode());
    const b = renderHook(() => useInputMode());

    document.documentElement.setAttribute(INPUT_MODE_ATTR, "mouse");
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(document.documentElement.getAttribute(INPUT_MODE_ATTR)).toBe(
      "keyboard"
    );

    a.unmount();
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "mouse");
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(document.documentElement.getAttribute(INPUT_MODE_ATTR)).toBe(
      "keyboard"
    );

    b.unmount();
    document.documentElement.setAttribute(INPUT_MODE_ATTR, "mouse");
    window.dispatchEvent(new KeyboardEvent("keydown"));
    expect(document.documentElement.getAttribute(INPUT_MODE_ATTR)).toBe(
      "mouse"
    );
  });
});
