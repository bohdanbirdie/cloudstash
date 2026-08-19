import { Effect, Option, Schema } from "effect";

import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "./mcp";

const ConsentWorkspaceResponse = Schema.Struct({
  organization: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
      })
    )
  ),
  session: Schema.Struct({
    activeOrganizationId: Schema.optional(Schema.NullOr(Schema.String)),
  }),
});

const decodeConsentWorkspace = Schema.decodeUnknownOption(
  ConsentWorkspaceResponse
);
const decodeUrl = Schema.decodeUnknownOption(Schema.URLFromString);

type ConsentWorkspace = {
  readonly id: string;
  readonly name: string;
};

export type ConsentWorkspaceResult =
  | { readonly ok: true; readonly workspace: ConsentWorkspace }
  | { readonly ok: false; readonly error: string };

const failure = (error: string): ConsentWorkspaceResult => ({
  error,
  ok: false,
});

export const loadConsentWorkspaceEffect = Effect.fn(
  "OAuthConsent.loadWorkspace"
)(function* (fetcher: typeof fetch = fetch) {
  const response = yield* Effect.tryPromise(() => fetcher("/api/auth/me")).pipe(
    Effect.option
  );
  if (Option.isNone(response) || !response.value.ok) {
    return failure("Cloudstash could not resolve your active workspace.");
  }

  const body = yield* Effect.tryPromise(() =>
    response.value.json<unknown>()
  ).pipe(Effect.option);
  if (Option.isNone(body)) {
    return failure("Cloudstash could not verify the workspace for this grant.");
  }
  const decoded = decodeConsentWorkspace(body.value);
  if (Option.isNone(decoded)) {
    return failure("Cloudstash could not verify the workspace for this grant.");
  }

  const { activeOrganizationId } = decoded.value.session;
  if (!activeOrganizationId) {
    return failure(
      "Select an active workspace before authorizing this MCP client."
    );
  }

  const organization = decoded.value.organization;
  if (
    !organization ||
    organization.id !== activeOrganizationId ||
    !organization.name.trim()
  ) {
    return failure("Cloudstash could not verify the workspace for this grant.");
  }

  return {
    ok: true as const,
    workspace: { id: activeOrganizationId, name: organization.name },
  };
});

export const loadConsentWorkspace = (
  fetcher: typeof fetch = fetch
): Promise<ConsentWorkspaceResult> =>
  Effect.runPromise(loadConsentWorkspaceEffect(fetcher));

export const consentRedirectTarget = (
  search: URLSearchParams
): string | null => {
  const redirectUri = search.get("redirect_uri");
  if (!redirectUri) return null;
  const decoded = decodeUrl(redirectUri);
  if (Option.isNone(decoded)) return null;
  if (
    decoded.value.protocol === "http:" ||
    decoded.value.protocol === "https:"
  ) {
    return decoded.value.host;
  }
  return `${decoded.value.protocol}//${decoded.value.host}`;
};

export const consentPermissionDescriptions = (
  scopes: readonly string[]
): readonly string[] => {
  const requested = new Set(scopes);
  const descriptions: string[] = [];
  const canRead = requested.has(MCP_READ_SCOPE);
  const canWrite = requested.has(MCP_WRITE_SCOPE);

  if (canRead && canWrite) descriptions.push("View and save links");
  else if (canRead) descriptions.push("View saved links");
  else if (canWrite) descriptions.push("Save new links");
  else if (requested.has("openid")) {
    descriptions.push("Confirm your Cloudstash account");
  }

  if (requested.has("offline_access")) {
    descriptions.push("Stay connected until you disconnect");
  }

  return descriptions;
};
