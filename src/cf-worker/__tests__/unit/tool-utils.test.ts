import { type UIMessage } from "@ai-sdk/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the ai package before importing the module under test
vi.mock("ai", () => ({
  getToolName: (part: { toolName?: string }) => part.toolName,
  isToolUIPart: (part: unknown) =>
    part !== null &&
    typeof part === "object" &&
    "type" in part &&
    (part as { type: string }).type === "tool-invocation",
}));

import {
  APPROVAL,
  hasToolConfirmation,
  processToolCalls,
} from "../../chat-agent/utils";

// Helper to create a tool UI part
const createToolPart = (
  toolName: string,
  output: string,
  input?: Record<string, unknown>
) => ({
  type: "tool-invocation" as const,
  toolCallId: `call-${Math.random().toString(36).slice(2)}`,
  toolName,
  state: "result" as const,
  result: output,
  output,
  input,
});

// Helper to create a text part
const createTextPart = (text: string) => ({
  type: "text" as const,
  text,
});

// Helper to create a UIMessage
const createMessage = (
  role: "user" | "assistant",
  parts: Array<
    ReturnType<typeof createToolPart> | ReturnType<typeof createTextPart>
  >
): UIMessage =>
  ({
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role,
    parts,
  }) as UIMessage;

describe("APPROVAL constants", () => {
  it("has YES value", () => {
    expect(APPROVAL.YES).toBe("Yes, confirmed.");
  });

  it("has NO value", () => {
    expect(APPROVAL.NO).toBe("No, denied.");
  });
});

describe("hasToolConfirmation", () => {
  it("returns true when deleteLink has YES approval", () => {
    const message = createMessage("user", [
      createToolPart("deleteLink", APPROVAL.YES),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });

  it("returns true when deleteLink has NO approval", () => {
    const message = createMessage("user", [
      createToolPart("deleteLink", APPROVAL.NO),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });

  it("returns true when deleteLinks has YES approval", () => {
    const message = createMessage("user", [
      createToolPart("deleteLinks", APPROVAL.YES),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });

  it("returns true when deleteLinks has NO approval", () => {
    const message = createMessage("user", [
      createToolPart("deleteLinks", APPROVAL.NO),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });

  it("returns false for tools not requiring confirmation", () => {
    const message = createMessage("user", [
      createToolPart("saveLink", APPROVAL.YES),
    ]);
    expect(hasToolConfirmation(message)).toBe(false);
  });

  it("returns false when output is not approval value", () => {
    const message = createMessage("user", [
      createToolPart("deleteLink", "some other output"),
    ]);
    expect(hasToolConfirmation(message)).toBe(false);
  });

  it("returns false for message with only text parts", () => {
    const message = createMessage("user", [createTextPart("Hello")]);
    expect(hasToolConfirmation(message)).toBe(false);
  });

  it("returns false for message with no parts", () => {
    const message = { id: "msg-1", role: "user" as const } as UIMessage;
    expect(hasToolConfirmation(message)).toBe(false);
  });

  it("returns false for undefined message", () => {
    expect(hasToolConfirmation(undefined as unknown as UIMessage)).toBe(false);
  });

  it("handles mixed parts with confirmation tool", () => {
    const message = createMessage("user", [
      createTextPart("Please delete this"),
      createToolPart("deleteLink", APPROVAL.YES),
      createTextPart("Thank you"),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });

  it("handles multiple tool parts with one requiring confirmation", () => {
    const message = createMessage("user", [
      createToolPart("searchLinks", "results"),
      createToolPart("deleteLink", APPROVAL.YES),
    ]);
    expect(hasToolConfirmation(message)).toBe(true);
  });
});

describe("processToolCalls", () => {
  const mockTools = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns messages unchanged when last message has no parts", async () => {
    const messages = [{ id: "msg-1", role: "user" as const }] as UIMessage[];
    const result = await processToolCalls({ tools: mockTools, messages }, {});
    expect(result).toEqual(messages);
  });

  it("returns messages unchanged for empty messages array", async () => {
    const result = await processToolCalls(
      { tools: mockTools, messages: [] },
      {}
    );
    expect(result).toEqual([]);
  });

  it("executes tool when approved", async () => {
    const executor = vi.fn().mockResolvedValue('{"success": true}');
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.YES, { id: "link-123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    expect(executor).toHaveBeenCalledWith({ id: "link-123" });
    expect(result[0].parts[0]).toHaveProperty("output", '{"success": true}');
  });

  it("replaces output with denial message when denied", async () => {
    const executor = vi.fn();
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.NO, { id: "link-123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    expect(executor).not.toHaveBeenCalled();
    expect(result[0].parts[0]).toHaveProperty(
      "output",
      "Error: User denied access to tool execution"
    );
  });

  it("handles executor error gracefully", async () => {
    const executor = vi.fn().mockRejectedValue(new Error("Database error"));
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.YES, { id: "link-123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    expect(result[0].parts[0]).toHaveProperty(
      "output",
      "Error: Tool execution failed"
    );
  });

  it("passes empty object when input is undefined", async () => {
    const executor = vi.fn().mockResolvedValue('{"success": true}');
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [createToolPart("deleteLink", APPROVAL.YES)]),
    ];

    await processToolCalls({ tools: mockTools, messages }, executors);

    expect(executor).toHaveBeenCalledWith({});
  });

  it("leaves parts unchanged when no executor exists", async () => {
    const messages = [
      createMessage("assistant", [
        createToolPart("unknownTool", APPROVAL.YES, { data: "test" }),
      ]),
    ];

    const result = await processToolCalls({ tools: mockTools, messages }, {});

    // unknownTool is not in TOOLS_REQUIRING_CONFIRMATION, so isApprovalOutput returns false
    // and the part is returned unchanged
    expect(result[0].parts[0]).toHaveProperty("output", APPROVAL.YES);
  });

  it("processes multiple tool parts concurrently", async () => {
    const callOrder: string[] = [];

    const deleteLink = vi.fn().mockImplementation(async () => {
      callOrder.push("deleteLink-start");
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push("deleteLink-end");
      return '{"deleted": true}';
    });

    const deleteLinks = vi.fn().mockImplementation(async () => {
      callOrder.push("deleteLinks-start");
      await new Promise((r) => setTimeout(r, 5));
      callOrder.push("deleteLinks-end");
      return '{"deleted": 2}';
    });

    const executors = { deleteLink, deleteLinks };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.YES, { id: "1" }),
        createToolPart("deleteLinks", APPROVAL.YES, { ids: ["2", "3"] }),
      ]),
    ];

    await processToolCalls({ tools: mockTools, messages }, executors);

    // Verify both executors were called
    expect(deleteLink).toHaveBeenCalledWith({ id: "1" });
    expect(deleteLinks).toHaveBeenCalledWith({ ids: ["2", "3"] });

    // Both should start before either ends (concurrent execution)
    expect(callOrder).toContain("deleteLink-start");
    expect(callOrder).toContain("deleteLinks-start");
    expect(callOrder).toContain("deleteLink-end");
    expect(callOrder).toContain("deleteLinks-end");

    // deleteLinks should end first (shorter timeout)
    expect(callOrder.indexOf("deleteLinks-end")).toBeLessThan(
      callOrder.indexOf("deleteLink-end")
    );
  });

  it("preserves earlier messages in the array", async () => {
    const executor = vi.fn().mockResolvedValue('{"success": true}');
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("user", [createTextPart("Delete my link")]),
      createMessage("assistant", [createTextPart("I'll delete it")]),
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.YES, { id: "123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);
    expect(result[2]).not.toBe(messages[2]); // Last one is processed
  });

  it("filters out falsy parts after processing", async () => {
    const executor = vi.fn().mockResolvedValue('{"success": true}');
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", APPROVAL.YES, { id: "123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    // Parts should be filtered (no null/undefined)
    expect(result[0].parts.every(Boolean)).toBe(true);
  });

  it("handles non-approval tool outputs", async () => {
    const executor = vi.fn();
    const executors = { deleteLink: executor };

    const messages = [
      createMessage("assistant", [
        createToolPart("deleteLink", "regular output", { id: "123" }),
      ]),
    ];

    const result = await processToolCalls(
      { tools: mockTools, messages },
      executors
    );

    expect(executor).not.toHaveBeenCalled();
    expect(result[0].parts[0]).toHaveProperty("output", "regular output");
  });
});
