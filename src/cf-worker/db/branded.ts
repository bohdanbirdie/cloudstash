import { Schema } from "effect"

export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const OrgId = Schema.String.pipe(Schema.brand("OrgId"))
export type OrgId = typeof OrgId.Type

export const LinkId = Schema.String.pipe(Schema.brand("LinkId"))
export type LinkId = typeof LinkId.Type

export const InviteId = Schema.String.pipe(Schema.brand("InviteId"))
export type InviteId = typeof InviteId.Type

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"))
export type SessionId = typeof SessionId.Type

export const TagId = Schema.String.pipe(Schema.brand("TagId"))
export type TagId = typeof TagId.Type

export const MemberId = Schema.String.pipe(Schema.brand("MemberId"))
export type MemberId = typeof MemberId.Type
