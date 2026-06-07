import { createAccessControl } from "better-auth/plugins/access";
import type { Role } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";

export const statement = {
  ...defaultStatements,
  dashboard: ["view"],
  billing: ["manage"],
  members: ["manage"],
  system: ["manage"],
} as const;

export const ac = createAccessControl(statement);

const adminRole = ac.newRole({
  ...adminAc.statements,
  dashboard: ["view"],
  billing: ["manage"],
  members: ["manage"],
  system: ["manage"],
});

const viewerRole = ac.newRole({ ...userAc.statements, dashboard: ["view"] });

const userRole = ac.newRole({ ...userAc.statements });

export const roles = {
  admin: adminRole,
  viewer: viewerRole,
  user: userRole,
} satisfies Record<string, Role>;

export type AppRole = keyof typeof roles;

export const DEFAULT_ROLE = "user" satisfies AppRole;

export type Permission = {
  [Resource in keyof typeof statement]?: readonly (typeof statement)[Resource][number][];
};

export const PERMISSIONS = {
  viewDashboard: { dashboard: ["view"] },
  manageBilling: { billing: ["manage"] },
  manageMembers: { members: ["manage"] },
  manageSystem: { system: ["manage"] },
} as const satisfies Record<string, Permission>;

export function hasPermission(
  role: string | null | undefined,
  permission: Permission
): boolean {
  const table: Record<string, Role> = roles;
  const resolved = table[role ?? DEFAULT_ROLE] ?? table[DEFAULT_ROLE];
  return resolved.authorize(permission).success;
}
