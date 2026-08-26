import { API_FALLBACK_ORIGIN } from "./api-spec";

const MCP_PATH = "/mcp";

export const mcpCodingAgentSetup = (endpoint: string): string =>
  `npx add-mcp ${endpoint} --name cloudstash --global`;

export type McpAvailabilityState =
  | "loading"
  | "unavailable"
  | "disabled"
  | "upgrade"
  | "available";

export const mcpAvailabilityState = (input: {
  readonly allowed: boolean;
  readonly alreadyPro: boolean;
  readonly failed: boolean;
  readonly loading: boolean;
}): McpAvailabilityState => {
  if (input.loading) return "loading";
  if (input.failed) return "unavailable";
  if (!input.allowed && input.alreadyPro) return "disabled";
  return input.allowed ? "available" : "upgrade";
};

export const mcpEndpointForOrigin = (origin: string): string =>
  new URL(MCP_PATH, origin).toString();

export const mcpEndpoint = (): string =>
  mcpEndpointForOrigin(
    typeof window === "undefined" ? API_FALLBACK_ORIGIN : window.location.origin
  );
