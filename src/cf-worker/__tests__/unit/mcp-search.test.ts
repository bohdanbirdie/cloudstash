import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect, vi } from "vitest";

import type { SearchResult } from "../../../livestore/queries/schemas";
import { OrgId, UserId } from "../../db/branded";
import { LinksReadError, searchWorkspaceLinks } from "../../links/handler";
import { normalizeLinkSearchQuery } from "../../links/search-contract";
import type { McpAuthorization } from "../../mcp/auth";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "../../mcp/config";
import {
  authorizeToolScope,
  McpSaveInput,
  McpSearchInput,
  runMcpToolHandler,
  toMcpSearchResults,
} from "../../mcp/server";
import type { Env } from "../../shared";

const authorization = (scopes: readonly string[]): McpAuthorization => ({
  clientId: "client-1",
  orgId: OrgId.make("org-1"),
  scopes,
  userId: UserId.make("user-1"),
});

const searchResult = (index: number): SearchResult => ({
  completedAt: null,
  createdAt: index,
  deletedAt: null,
  description: `Description ${index}`,
  domain: "example.com",
  favicon: `https://example.com/${index}.ico`,
  id: `link-${index}`,
  image: `https://example.com/${index}.png`,
  score: 100 - index,
  status: "unread",
  summary: `Summary ${index}`,
  title: `Title ${index}`,
  url: `https://example.com/${index}`,
});

const envWithSearch = (
  searchLinks: (params: { query: string }) => Promise<readonly SearchResult[]>,
  idFromName = vi.fn(() => ({ toString: () => "do-id" }))
): Env =>
  ({
    Chat: {
      get: vi.fn(() => ({ searchLinks })),
      idFromName,
    },
  }) as unknown as Env;

describe("MCP link search", () => {
  it("requires a trimmed query no longer than 200 characters", () => {
    expect(normalizeLinkSearchQuery("   ")).toBeNull();
    expect(normalizeLinkSearchQuery("x".repeat(201))).toBeNull();
    expect(normalizeLinkSearchQuery("  needle  ")).toBe("needle");
    expect(McpSearchInput.safeParse({ query: "   " }).success).toBe(false);
    expect(McpSearchInput.safeParse({ query: "x".repeat(201) }).success).toBe(
      false
    );
    expect(McpSearchInput.parse({ query: "  needle  " })).toEqual({
      query: "needle",
    });
  });

  it("accepts only HTTP(S) save targets", () => {
    expect(McpSaveInput.safeParse({ url: "https://example.com" }).success).toBe(
      true
    );
    for (const url of [
      "file:///tmp/link",
      "javascript:alert(1)",
      "ftp://example.com",
    ]) {
      expect(McpSaveInput.safeParse({ url }).success).toBe(false);
    }
  });

  it("fails the search tool closed without links:read", () => {
    expect(authorizeToolScope(null, "search_links")).toMatchObject({
      ok: false,
      result: { isError: true },
    });
    expect(
      authorizeToolScope(authorization([MCP_WRITE_SCOPE]), "search_links")
    ).toMatchObject({ ok: false, result: { isError: true } });
    expect(
      authorizeToolScope(authorization([MCP_READ_SCOPE]), "search_links")
    ).toMatchObject({ ok: true });
  });

  it.effect("calls the workspace DO through the narrow read-only RPC", () => {
    const searchLinks = vi.fn(async () => [searchResult(1)]);
    const idFromName = vi.fn(() => ({ toString: () => "do-id" }));
    const env = envWithSearch(searchLinks, idFromName);

    return searchWorkspaceLinks(OrgId.make("org-1"), "needle", env).pipe(
      Effect.tap((results) =>
        Effect.sync(() => {
          expect(results).toEqual([searchResult(1)]);
          expect(idFromName).toHaveBeenCalledWith("org-1");
          expect(searchLinks).toHaveBeenCalledWith({ query: "needle" });
        })
      )
    );
  });

  it.effect("maps a DO search failure to LinksReadError", () => {
    const cause = new Error("DO unavailable");
    const env = envWithSearch(() => Promise.reject(cause));

    return searchWorkspaceLinks(OrgId.make("org-1"), "needle", env).pipe(
      Effect.as(null),
      Effect.catch((error) => Effect.succeed(error)),
      Effect.tap((failure) =>
        Effect.sync(() => {
          expect(failure).toBeInstanceOf(LinksReadError);
          expect(failure).toMatchObject({ cause });
        })
      )
    );
  });

  it("returns at most 20 results with the bounded MCP shape", () => {
    const results = toMcpSearchResults(
      Array.from({ length: 21 }, (_, index) => searchResult(index))
    );

    expect(results).toHaveLength(20);
    expect(Object.keys(results[0] ?? {}).toSorted()).toEqual(
      [
        "completedAt",
        "createdAt",
        "description",
        "domain",
        "id",
        "score",
        "status",
        "summary",
        "title",
        "url",
      ].toSorted()
    );
    expect(results[19]).toMatchObject({ id: "link-19", score: 81 });
  });

  it("maps defects outside Effect.runPromise to an MCP tool error", async () => {
    const synchronous = await runMcpToolHandler(
      "MCP search_links",
      "Search unavailable",
      () => {
        throw new Error("layer construction failed");
      }
    );
    const asynchronous = await runMcpToolHandler(
      "MCP save_link",
      "Save unavailable",
      () => Promise.reject(new Error("runPromise rejected"))
    );

    expect(synchronous).toMatchObject({ isError: true });
    expect(asynchronous).toMatchObject({ isError: true });
  });
});
