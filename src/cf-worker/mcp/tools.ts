import { McpServer } from "@modelcontextprotocol/server";
import { Cause, Effect, Schema } from "effect";

import { HttpUrlFromString } from "@/lib/http-url";
import {
  GetLinkInput,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";
import { MCP_TOOL_SCOPES } from "@/lib/mcp";

import { trackEvent } from "../analytics";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import type { WorkspaceLinksRpcResult } from "../workspace-links/rpc";
import type { McpAuthorization } from "./auth";

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const toolError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
  isError: true,
});

export const runMcpToolHandler = <Result, Error, Requirements>(
  operation: string,
  failureMessage: string,
  effect: Effect.Effect<Result, Error, Requirements>,
  logAnnotations: Readonly<Record<string, unknown>> = {}
) =>
  effect.pipe(
    Effect.catchCause((cause) =>
      Effect.logError(`${operation} failed`).pipe(
        Effect.annotateLogs({
          ...safeErrorInfo(Cause.squash(cause)),
          ...logAnnotations,
        }),
        Effect.as(toolError(failureMessage))
      )
    )
  );

export const authorizeToolScope = (
  authorization: McpAuthorization,
  tool: keyof typeof MCP_TOOL_SCOPES
) => {
  const scope = MCP_TOOL_SCOPES[tool];
  if (!authorization.scopes.includes(scope)) {
    return {
      ok: false as const,
      result: toolError(`Missing required scope: ${scope}`),
    };
  }
  return { authorization, ok: true as const };
};

const EFFECT_CONSTRAINT_KEYWORDS = new Set([
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "pattern",
  "uniqueItems",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Effect emits each `.check` as a separate `allOf` branch. The schema is valid,
 * but clients commonly infer those constrained primitives as `unknown`.
 * Collapse only simple constraint branches; leave structural `allOf` branches
 * untouched so the advertised schema stays equivalent to Effect's schema.
 */
const flattenEffectConstraints = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(flattenEffectConstraints);
  if (!isRecord(value)) return value;

  const schema = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      flattenEffectConstraints(child),
    ])
  );
  if (!Array.isArray(schema.allOf)) return schema;

  const remaining: unknown[] = [];
  for (const branch of schema.allOf) {
    if (
      isRecord(branch) &&
      Object.keys(branch).every(
        (key) => EFFECT_CONSTRAINT_KEYWORDS.has(key) && !(key in schema)
      )
    ) {
      Object.assign(schema, branch);
    } else {
      remaining.push(branch);
    }
  }

  if (remaining.length === 0) delete schema.allOf;
  else schema.allOf = remaining;
  return schema;
};

const toMcpSchema = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S
) => {
  const isolated = Schema.make<S>(schema.ast);
  const standard = Schema.toStandardJSONSchemaV1(
    Schema.toStandardSchemaV1(isolated, {
      parseOptions: { onExcessProperty: "error" },
    })
  );
  const jsonSchema = standard["~standard"].jsonSchema;
  return Object.assign(Schema.make<typeof standard>(standard.ast), {
    "~standard": {
      ...standard["~standard"],
      jsonSchema: {
        input: (options: Parameters<typeof jsonSchema.input>[0]) =>
          flattenEffectConstraints(jsonSchema.input(options)),
        output: (options: Parameters<typeof jsonSchema.output>[0]) =>
          flattenEffectConstraints(jsonSchema.output(options)),
      },
    },
  });
};

export const McpListInput = toMcpSchema(ListLinksInput);
export const McpSearchInput = toMcpSchema(SearchLinksInput);
export const McpGetInput = toMcpSchema(GetLinkInput);
export const McpSaveInput = toMcpSchema(
  Schema.Struct({
    url: HttpUrlFromString,
    tags: SaveLinkInput.fields.tags,
  })
);
export const McpUpdateInput = toMcpSchema(UpdateLinkInput);
export const McpUpdateManyInput = toMcpSchema(UpdateLinksInput);

const workspaceResult = <Value>(result: WorkspaceLinksRpcResult<Value>) =>
  result.ok ? textResult(result.value) : toolError(result.error.message);

const workspace = (env: Env, authorization: McpAuthorization) =>
  env.LINK_PROCESSOR_DO.get(
    env.LINK_PROCESSOR_DO.idFromName(authorization.orgId)
  );

const run = <Value>(
  authorization: McpAuthorization,
  operation: string,
  failureMessage: string,
  call: () => Promise<WorkspaceLinksRpcResult<Value>>
) => {
  const orgId = maskId(authorization.orgId);
  return runMcpToolHandler(
    operation,
    failureMessage,
    Effect.tryPromise(call).pipe(
      Effect.map(workspaceResult),
      Effect.withSpan(operation, {
        attributes: { orgId },
      })
    ),
    { orgId }
  ).pipe(Effect.provide(OtelTracingLive), Effect.runPromise);
};

export const makeMcpServer = (
  env: Env,
  authorization: McpAuthorization
): McpServer => {
  const server = new McpServer({
    name: "cloudstash",
    title: "Cloudstash",
    version: "1.0.0",
    websiteUrl: new URL(env.BETTER_AUTH_URL).origin,
    icons: [
      {
        src: new URL("/logo192.png", env.BETTER_AUTH_URL).toString(),
        mimeType: "image/png",
        sizes: ["192x192"],
      },
      {
        src: new URL("/logo512.png", env.BETTER_AUTH_URL).toString(),
        mimeType: "image/png",
        sizes: ["512x512"],
      },
    ],
  });

  server.registerTool(
    "list_links",
    {
      title: "List Cloudstash links",
      description:
        "List links with cursor pagination and date/order filters. active (the default) excludes archive; any includes full history; legacy all aliases active.",
      inputSchema: McpListInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const scope = authorizeToolScope(authorization, "list_links");
      if (!scope.ok) return scope.result;
      return run(
        scope.authorization,
        "MCP.listLinks",
        "Cloudstash could not list links",
        () => workspace(env, scope.authorization).listLinks(input)
      );
    }
  );

  server.registerTool(
    "search_links",
    {
      title: "Search Cloudstash links",
      description:
        'Ranked search across titles, tags, domains, descriptions, summaries, and URLs. Defaults to any-term matching in active links; use match: "all" for every term or state: "any" for archived history. Legacy state: "all" aliases active.',
      inputSchema: McpSearchInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const scope = authorizeToolScope(authorization, "search_links");
      if (!scope.ok) return scope.result;
      return run(
        scope.authorization,
        "MCP.searchLinks",
        "Cloudstash could not search links",
        () => workspace(env, scope.authorization).searchLinks(input)
      );
    }
  );

  server.registerTool(
    "get_link",
    {
      title: "Get a Cloudstash link",
      description:
        "Get the complete saved-link record for an ID in the approved library.",
      inputSchema: McpGetInput,
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const scope = authorizeToolScope(authorization, "get_link");
      if (!scope.ok) return scope.result;
      return run(
        scope.authorization,
        "MCP.getLink",
        "Cloudstash could not get this link",
        () => workspace(env, scope.authorization).getLink(input)
      );
    }
  );

  server.registerTool(
    "save_link",
    {
      title: "Save a Cloudstash link",
      description:
        "Save an HTTP(S) URL to the approved library and optionally attach tags in the same operation.",
      inputSchema: McpSaveInput,
      annotations: { idempotentHint: true, readOnlyHint: false },
    },
    async ({ url, tags }) => {
      const scope = authorizeToolScope(authorization, "save_link");
      if (!scope.ok) return scope.result;
      const result = await run(
        scope.authorization,
        "MCP.saveLink",
        "Cloudstash could not save this link",
        () =>
          workspace(env, scope.authorization).saveLink({
            url: url.href,
            ...(tags === undefined ? {} : { tags }),
            source: "mcp",
          })
      );
      if (!("isError" in result)) {
        trackEvent(env.USAGE_ANALYTICS, {
          userId: scope.authorization.userId,
          event: "ingest",
          orgId: scope.authorization.orgId,
        });
      }
      return result;
    }
  );

  server.registerTool(
    "update_link",
    {
      title: "Update a Cloudstash link",
      description:
        "Change a link's inbox/completed/archive state or add, remove, or replace tags. URLs and generated metadata are immutable.",
      inputSchema: McpUpdateInput,
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        readOnlyHint: false,
      },
    },
    async (input) => {
      const scope = authorizeToolScope(authorization, "update_link");
      if (!scope.ok) return scope.result;
      return run(
        scope.authorization,
        "MCP.updateLink",
        "Cloudstash could not update this link",
        () => workspace(env, scope.authorization).updateLink(input)
      );
    }
  );

  server.registerTool(
    "update_links",
    {
      title: "Update Cloudstash links",
      description:
        "Update up to 100 links by IDs or a saved-date/state filter. Use nextCursor to continue a larger reversible batch.",
      inputSchema: McpUpdateManyInput,
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        readOnlyHint: false,
      },
    },
    async (input) => {
      const scope = authorizeToolScope(authorization, "update_links");
      if (!scope.ok) return scope.result;
      return run(
        scope.authorization,
        "MCP.updateLinks",
        "Cloudstash could not update these links",
        () => workspace(env, scope.authorization).updateLinks(input)
      );
    }
  );

  return server;
};
