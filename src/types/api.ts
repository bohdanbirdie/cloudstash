import type { invite, user } from '@/cf-worker/db/schema'

export type InviteRow = typeof invite.$inferSelect
export type UserRow = typeof user.$inferSelect

export type UserBasic = Pick<UserRow, 'id' | 'name' | 'email'>

export type InviteWithRelations = InviteRow & {
  createdBy: UserBasic | null
  usedBy: UserBasic | null
}

export type AdminUser = Pick<
  UserRow,
  'id' | 'name' | 'email' | 'role' | 'approved' | 'banned' | 'createdAt'
>

export type InvitesListResponse = {
  invites: InviteWithRelations[]
}

export type InviteCreateResponse = {
  code: string
  expiresAt: Date | null
}

export type ApiErrorResponse = {
  error: string
}
