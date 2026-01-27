import { eq } from "drizzle-orm";

import { createDb } from "../db";
import * as schema from "../db/schema";
import { type OrgFeatures } from "../db/schema";
import { type Env } from "../shared";

export interface WorkspaceWithOwner {
  id: string;
  name: string;
  slug: string | null;
  creatorEmail: string | null;
  features: OrgFeatures;
}

export async function handleListWorkspaces(
  _request: Request,
  env: Env
): Promise<Response> {
  const db = createDb(env.DB);

  const orgs = await db.query.organization.findMany({
    with: {
      members: {
        where: eq(schema.member.role, "owner"),
        with: {
          user: { columns: { email: true } },
        },
        limit: 1,
      },
    },
  });

  const workspaces: WorkspaceWithOwner[] = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    creatorEmail: org.members[0]?.user?.email ?? null,
    features: (org.features as OrgFeatures) ?? {},
  }));

  return Response.json({ workspaces });
}

export async function handleGetOrgSettings(
  _request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  const db = createDb(env.DB);

  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, orgId),
    columns: { features: true },
  });

  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  return Response.json({ features: (org.features as OrgFeatures) ?? {} });
}

export async function handleUpdateOrgSettings(
  request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  const db = createDb(env.DB);

  let body: { features: OrgFeatures };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const org = await db.query.organization.findFirst({
    where: eq(schema.organization.id, orgId),
    columns: { id: true },
  });

  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  await db
    .update(schema.organization)
    .set({ features: body.features })
    .where(eq(schema.organization.id, orgId));

  return Response.json({ success: true, features: body.features });
}
