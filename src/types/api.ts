import { type invite, type user } from "@/cf-worker/db/schema";

export type InviteRow = typeof invite.$inferSelect;
export type UserRow = typeof user.$inferSelect;

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
