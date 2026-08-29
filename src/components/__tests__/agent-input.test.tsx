// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentInputProvider } from "@/components/agent/agent-chat-provider";
import { InputForm } from "@/components/agent/agent-input";

vi.mock("@/hooks/use-narrow-viewport", () => ({
  useNarrowViewport: () => false,
}));

afterEach(cleanup);

describe("agent input keyboard boundary", () => {
  it("keeps Shift+Enter as a native newline without reaching cmdk", () => {
    const onParentKeyDown = vi.fn();

    render(
      <InputHarness onParentKeyDown={onParentKeyDown} onSubmit={vi.fn()} />
    );

    const defaultAllowed = fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Message the assistant" }),
      { key: "Enter", shiftKey: true }
    );

    expect(defaultAllowed).toBe(true);
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it("submits plain Enter without reaching cmdk", () => {
    const onParentKeyDown = vi.fn();
    const onSubmit = vi.fn();

    render(
      <InputHarness onParentKeyDown={onParentKeyDown} onSubmit={onSubmit} />
    );

    const textarea = screen.getByRole("textbox", {
      name: "Message the assistant",
    });
    fireEvent.change(textarea, { target: { value: "Find my Lisbon links" } });
    const defaultAllowed = fireEvent.keyDown(textarea, { key: "Enter" });

    expect(defaultAllowed).toBe(false);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });
});

function InputHarness({
  onParentKeyDown,
  onSubmit,
}: {
  onParentKeyDown: () => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div
      role="group"
      aria-label="Command menu boundary"
      onKeyDown={onParentKeyDown}
    >
      <AgentInputProvider textareaRef={textareaRef}>
        <InputForm
          canSend
          placeholder="Ask about your links…"
          onSubmit={onSubmit}
        />
      </AgentInputProvider>
    </div>
  );
}
