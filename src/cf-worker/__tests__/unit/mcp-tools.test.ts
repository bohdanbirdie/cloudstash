import { describe, it } from "@effect/vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { Effect, Option, Schema } from "effect";
import { expect } from "vitest";

import { normalizeLinkSearchQuery } from "@/lib/link-search";
import { SearchLinksInput } from "@/lib/links-contract";
import { MCP_TOOL_SCOPES } from "@/lib/mcp";

import { OrgId, UserId } from "../../db/branded";
import type { McpAuthorization } from "../../mcp/auth";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "../../mcp/config";
import {
  authorizeToolScope,
  McpSaveInput,
  McpSearchInput,
  McpUpdateInput,
  McpUpdateManyInput,
  makeMcpServer,
  runMcpToolHandler,
} from "../../mcp/tools";
import type { Env } from "../../shared";

type JsonSchema = Record<string, unknown>;

const COLLECTION_STATES = [
  "inbox",
  "completed",
  "active",
  "any",
  "all",
  "archive",
];

const property = (schema: JsonSchema, name: string): JsonSchema =>
  (schema.properties as Record<string, JsonSchema>)[name];

const withMcpClient = async <Value>(
  use: (client: Client) => Promise<Value>,
  options?: {
    readonly authorization?: McpAuthorization;
    readonly env?: Env;
  }
): Promise<Value> => {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "cloudstash-test", version: "1.0.0" });
  const server = makeMcpServer(
    options?.env ?? ({ BETTER_AUTH_URL: "https://cloudstash.test" } as Env),
    options?.authorization ?? authorization([])
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await use(client);
  } finally {
    await client.close();
    await server.close();
  }
};

const advertisedTools = () =>
  withMcpClient(async (client) => (await client.listTools()).tools);

const authorization = (scopes: readonly string[]): McpAuthorization => ({
  clientId: "client-1",
  externalCallAllowance: {
    limit: 10_000,
    resetsAt: "2026-09-01T00:00:00.000Z",
    usageWindowId: "2026-08",
  },
  orgId: OrgId.make("org-1"),
  scopes,
  userId: UserId.make("user-1"),
});

describe("MCP link tools", () => {
  it("publishes client-friendly schemas through tools/list", async () => {
    const tools = await advertisedTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool.inputSchema]));

    expect([...byName.keys()]).toEqual([
      "list_links",
      "search_links",
      "get_link",
      "save_link",
      "update_link",
      "update_links",
    ]);

    const list = byName.get("list_links")!;
    expect(property(list, "state")).toMatchObject({
      enum: COLLECTION_STATES,
      type: "string",
    });
    expect(property(list, "limit")).toMatchObject({
      exclusiveMinimum: 0,
      maximum: 100,
      type: "integer",
    });
    expect(property(list, "sort")).toMatchObject({
      enum: ["newest", "oldest"],
      type: "string",
    });
    expect(property(list, "cursor")).toMatchObject({
      minLength: 1,
      type: "string",
    });
    for (const date of ["createdAfter", "createdBefore"]) {
      expect(property(list, date)).toMatchObject({
        pattern: expect.any(String),
        type: "string",
      });
    }

    const search = byName.get("search_links")!;
    expect(property(search, "query")).toMatchObject({
      maxLength: 200,
      minLength: 1,
      type: "string",
    });
    expect(property(search, "match")).toMatchObject({
      enum: ["any", "all"],
      type: "string",
    });
    expect(property(search, "state")).toMatchObject({
      enum: COLLECTION_STATES,
      type: "string",
    });
    expect(property(search, "limit")).toMatchObject({
      exclusiveMinimum: 0,
      maximum: 20,
      type: "integer",
    });
    for (const date of ["createdAfter", "createdBefore"]) {
      expect(property(search, date)).toMatchObject({
        pattern: expect.any(String),
        type: "string",
      });
    }

    const get = byName.get("get_link")!;
    expect(property(get, "id")).toMatchObject({ minLength: 1, type: "string" });

    const save = byName.get("save_link")!;
    expect(property(save, "url")).toMatchObject({
      format: "uri",
      type: "string",
    });
    const saveTags = property(save, "tags");
    expect(saveTags).toMatchObject({
      items: { maxLength: 16, minLength: 1, type: "string" },
      maxItems: 20,
      type: "array",
    });

    const update = byName.get("update_link")!;
    expect(property(update, "id")).toMatchObject({
      minLength: 1,
      type: "string",
    });
    const updateChanges = property(update, "changes");
    expect(property(updateChanges, "state")).toMatchObject({
      enum: ["inbox", "completed", "archive"],
      type: "string",
    });
    const updateTags = property(updateChanges, "tags");
    for (const operation of ["add", "remove", "set"]) {
      expect(property(updateTags, operation)).toMatchObject({
        items: { maxLength: 16, minLength: 1, type: "string" },
        maxItems: 20,
        type: "array",
      });
    }

    const updateMany = byName.get("update_links")!;
    expect(property(updateMany, "ids")).toMatchObject({
      items: { minLength: 1, type: "string" },
      maxItems: 100,
      minItems: 1,
      type: "array",
    });
    expect(property(updateMany, "limit")).toMatchObject({
      exclusiveMinimum: 0,
      maximum: 100,
      type: "integer",
    });
    const where = property(updateMany, "where");
    expect(property(where, "state")).toMatchObject({
      enum: COLLECTION_STATES,
      type: "string",
    });
    expect(property(where, "cursor")).toMatchObject({
      minLength: 1,
      type: "string",
    });
    for (const date of ["createdAfter", "createdBefore"]) {
      expect(property(where, date)).toMatchObject({
        pattern: expect.any(String),
        type: "string",
      });
    }

    expect(JSON.stringify(tools)).not.toContain("allOf");
    expect(JSON.stringify(tools)).not.toContain("reprocess");
    expect(JSON.stringify(tools)).not.toContain('"type":"null"');
  });

  it("rejects unknown and null arguments at the MCP boundary", async () => {
    await withMcpClient(async (client) => {
      const unknownTopLevel = await client.callTool({
        name: "search_links",
        arguments: { query: "effect", unexpected: true },
      });
      expect(unknownTopLevel).toMatchObject({ isError: true });
      expect(unknownTopLevel.content).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining("Unexpected key"),
        })
      );

      const unknownNested = await client.callTool({
        name: "update_link",
        arguments: {
          changes: { state: "completed", unexpected: true },
          id: "link-1",
        },
      });
      expect(unknownNested).toMatchObject({ isError: true });
      expect(unknownNested.content).toContainEqual(
        expect.objectContaining({
          text: expect.stringContaining("Unexpected key"),
        })
      );

      const explicitNull = await client.callTool({
        name: "search_links",
        arguments: { limit: null, query: "effect" },
      });
      expect(explicitNull).toMatchObject({ isError: true });
      expect(explicitNull.content).toContainEqual(
        expect.objectContaining({ text: expect.stringContaining("got null") })
      );

      const omitted = await client.callTool({
        name: "search_links",
        arguments: { query: "effect" },
      });
      expect(omitted).toMatchObject({
        content: [{ text: "Missing required scope: links:read" }],
        isError: true,
      });
    });
  });

  it("forwards a tagless save without materializing tags as undefined", async () => {
    let received: unknown;
    const env = {
      BETTER_AUTH_URL: "https://cloudstash.test",
      LINK_PROCESSOR_DO: {
        get: () => ({
          reserveExternalCall: async () => ({ count: 1, status: "reserved" }),
          saveLink: async (input: unknown) => {
            received = input;
            return { ok: true, value: { link: { id: "link-1" } } };
          },
        }),
        idFromName: () => "workspace-id",
      },
    } as unknown as Env;

    const result = await withMcpClient(
      (client) =>
        client.callTool({
          name: "save_link",
          arguments: { url: "https://example.com" },
        }),
      { authorization: authorization([MCP_WRITE_SCOPE]), env }
    );

    expect(result.isError).not.toBe(true);
    expect(received).toEqual({
      source: "mcp",
      url: "https://example.com/",
    });
  });

  it("keeps the source Effect schema free of MCP Standard Schema state", () => {
    expect("~standard" in SearchLinksInput).toBe(false);
    expect("~standard" in McpSearchInput).toBe(true);
  });

  it("uses strict omission-only Standard Schema validation", async () => {
    const unknown = await McpUpdateInput["~standard"].validate({
      changes: { state: "completed", unexpected: true },
      id: "link-1",
    });
    expect(unknown).toMatchObject({
      issues: [expect.objectContaining({ path: ["changes", "unexpected"] })],
    });

    const explicitNull = await McpSearchInput["~standard"].validate({
      limit: null,
      query: "effect",
    });
    expect(explicitNull).toMatchObject({
      issues: [expect.objectContaining({ path: ["limit"] })],
    });

    const omitted = await McpSearchInput["~standard"].validate({
      query: "effect",
    });
    expect(omitted).toEqual({ value: { query: "effect" } });
  });

  it("requires a trimmed search query no longer than 200 characters", () => {
    const decode = Schema.decodeUnknownOption(McpSearchInput);
    expect(normalizeLinkSearchQuery("   ")).toBeNull();
    expect(normalizeLinkSearchQuery("x".repeat(201))).toBeNull();
    expect(normalizeLinkSearchQuery("  needle  ")).toBe("needle");
    expect(Option.isNone(decode({ query: "   " }))).toBe(true);
    expect(Option.isNone(decode({ query: "x".repeat(201) }))).toBe(true);
    expect(Option.isSome(decode({ query: "needle" }))).toBe(true);
  });

  it("accepts only HTTP(S) save targets", () => {
    const decode = Schema.decodeUnknownOption(McpSaveInput);
    expect(Option.isSome(decode({ url: "https://example.com" }))).toBe(true);
    for (const url of [
      "file:///tmp/link",
      "javascript:alert(1)",
      "ftp://example.com",
    ]) {
      expect(Option.isNone(decode({ url }))).toBe(true);
    }
  });

  it("keeps Effect validation for nested tag and ID arrays", () => {
    const decodeSave = Schema.decodeUnknownOption(McpSaveInput);
    expect(
      Option.isSome(
        decodeSave({ tags: ["reading"], url: "https://example.com" })
      )
    ).toBe(true);
    expect(
      Option.isNone(
        decodeSave({ tags: ["x".repeat(17)], url: "https://example.com" })
      )
    ).toBe(true);
    expect(
      Option.isNone(
        decodeSave({
          tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
          url: "https://example.com",
        })
      )
    ).toBe(true);

    const decodeUpdateMany = Schema.decodeUnknownOption(McpUpdateManyInput);
    expect(
      Option.isSome(
        decodeUpdateMany({
          changes: { state: "completed" },
          ids: ["link-1"],
        })
      )
    ).toBe(true);
    expect(
      Option.isNone(
        decodeUpdateMany({ changes: { state: "completed" }, ids: [] })
      )
    ).toBe(true);
    expect(
      Option.isNone(
        decodeUpdateMany({
          changes: { state: "completed" },
          ids: Array.from({ length: 101 }, (_, index) => `link-${index}`),
        })
      )
    ).toBe(true);
  });

  it("accepts state and tag updates but exposes no reprocessing input", () => {
    const decode = Schema.decodeUnknownOption(McpUpdateInput);
    const result = decode({
      id: "link-1",
      changes: {
        state: "completed",
        tags: { add: ["reading"] },
      },
    });
    expect(Option.isSome(result)).toBe(true);
    const jsonSchema = McpUpdateInput["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });
    expect(JSON.stringify(jsonSchema)).not.toContain("reprocess");
  });

  it("maps read and write tools to their matching scopes", () => {
    for (const tool of ["list_links", "search_links", "get_link"] as const) {
      expect(
        authorizeToolScope(authorization([MCP_READ_SCOPE]), tool)
      ).toMatchObject({ ok: true });
      expect(
        authorizeToolScope(authorization([MCP_WRITE_SCOPE]), tool)
      ).toMatchObject({ ok: false });
    }
    for (const tool of ["save_link", "update_link", "update_links"] as const) {
      expect(
        authorizeToolScope(authorization([MCP_WRITE_SCOPE]), tool)
      ).toMatchObject({ ok: true });
      expect(
        authorizeToolScope(authorization([MCP_READ_SCOPE]), tool)
      ).toMatchObject({ ok: false });
    }
  });

  it.effect("maps tool defects to MCP errors", () =>
    Effect.gen(function* () {
      const result = yield* runMcpToolHandler(
        "MCP.searchLinks",
        "Search unavailable",
        Effect.die(new Error("layer construction failed"))
      );
      expect(result).toMatchObject({ isError: true });
    })
  );
});

// WK-15-A. authorizeToolScope's second argument is just a key of
// MCP_TOOL_SCOPES, unrelated to the name the surrounding registerTool call
// uses, so pasting the wrong literal into a tool block compiles and silently
// grants it the other scope. The table test above checks the map; this drives
// each registered tool through the real server with only the opposite scope
// held, so a mismatched guard shows up as a tool that answers instead of
// refusing.
const WRONG_SCOPE_CALLS = [
  { args: {}, name: "list_links", needs: MCP_READ_SCOPE },
  { args: { query: "effect" }, name: "search_links", needs: MCP_READ_SCOPE },
  { args: { id: "link-1" }, name: "get_link", needs: MCP_READ_SCOPE },
  {
    args: { url: "https://example.com/a" },
    name: "save_link",
    needs: MCP_WRITE_SCOPE,
  },
  {
    args: { changes: { state: "completed" }, id: "link-1" },
    name: "update_link",
    needs: MCP_WRITE_SCOPE,
  },
  {
    args: { changes: { state: "completed" }, ids: ["link-1"] },
    name: "update_links",
    needs: MCP_WRITE_SCOPE,
  },
] as const;

describe("MCP tool scope enforcement", () => {
  it("covers every registered tool", () => {
    expect(WRONG_SCOPE_CALLS.map((call) => call.name).toSorted()).toEqual(
      Object.keys(MCP_TOOL_SCOPES).toSorted()
    );
  });

  for (const { args, name, needs } of WRONG_SCOPE_CALLS) {
    const held = needs === MCP_READ_SCOPE ? MCP_WRITE_SCOPE : MCP_READ_SCOPE;

    it(`refuses ${name} when only ${held} is held`, async () => {
      const result = await withMcpClient(
        (client) => client.callTool({ name, arguments: args }),
        { authorization: authorization([held]) }
      );

      expect(result).toMatchObject({
        content: [{ text: `Missing required scope: ${needs}` }],
        isError: true,
      });
    });
  }
});
