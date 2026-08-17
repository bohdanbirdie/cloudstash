type ConsentWorkspace = {
  readonly id: string;
  readonly name: string;
};

export type ConsentWorkspaceResult =
  | { readonly ok: true; readonly workspace: ConsentWorkspace }
  | { readonly ok: false; readonly error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const loadConsentWorkspace = async (
  fetcher: typeof fetch = fetch
): Promise<ConsentWorkspaceResult> => {
  let response: Response;
  try {
    response = await fetcher("/api/auth/me");
  } catch {
    return {
      ok: false,
      error: "Cloudstash could not resolve your active workspace.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "Cloudstash could not resolve your active workspace.",
    };
  }

  const data: unknown = await response.json().catch(() => null);
  if (!isRecord(data) || !isRecord(data.session)) {
    return {
      ok: false,
      error: "Cloudstash could not verify the workspace for this grant.",
    };
  }

  const activeOrganizationId = data.session.activeOrganizationId;
  if (typeof activeOrganizationId !== "string" || !activeOrganizationId) {
    return {
      ok: false,
      error: "Select an active workspace before authorizing this MCP client.",
    };
  }

  if (
    !isRecord(data.organization) ||
    data.organization.id !== activeOrganizationId ||
    typeof data.organization.name !== "string" ||
    !data.organization.name.trim()
  ) {
    return {
      ok: false,
      error: "Cloudstash could not verify the workspace for this grant.",
    };
  }

  return {
    ok: true,
    workspace: {
      id: activeOrganizationId,
      name: data.organization.name,
    },
  };
};
