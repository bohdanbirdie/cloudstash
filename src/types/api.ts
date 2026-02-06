import {
  type invite,
  type user,
  type OrgFeatures,
} from "@/cf-worker/db/schema";

export type InviteRow = typeof invite.$inferSelect;
export type UserRow = typeof user.$inferSelect;

export interface MeResponse {
  organization: {
    id: string;
    name: string;
    slug: string;
    features: OrgFeatures;
  } | null;
  session: {
    activeOrganizationId: string | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export type UserBasic = Pick<UserRow, "id" | "name" | "email">;

export type InviteWithRelations = InviteRow & {
  createdBy: UserBasic | null;
  usedBy: UserBasic | null;
};

export type AdminUser = Pick<
  UserRow,
  "id" | "name" | "email" | "role" | "approved" | "banned" | "createdAt"
>;

export interface InvitesListResponse {
  invites: InviteWithRelations[];
}

export interface InviteCreateResponse {
  code: string;
  expiresAt: Date | null;
}

export interface ApiErrorResponse {
  error: string;
}
