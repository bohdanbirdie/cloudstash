// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

afterEach(cleanup);

describe("useCopyToClipboard", () => {
  it("exposes copied state after a successful write", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { result } = renderHook(() => useCopyToClipboard(10_000));

    act(() => result.current.copy("https://cloudstash.test/mcp"));

    await waitFor(() => expect(result.current.copied).toBe(true));
    expect(result.current.copyFailed).toBe(false);
    expect(writeText).toHaveBeenCalledWith("https://cloudstash.test/mcp");
  });

  it("exposes failure state when clipboard access is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useCopyToClipboard());

    act(() => result.current.copy("https://cloudstash.test/mcp"));

    expect(result.current.copied).toBe(false);
    expect(result.current.copyFailed).toBe(true);
  });
});
