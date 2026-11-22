import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    createdInvites: r.many.invite({ alias: "createdInvites" }),
    members: r.many.member(),
    sessions: r.many.session(),
    usedInvite: r.one.invite({
      from: r.user.id,
      to: r.invite.usedByUserId,
      alias: "usedInvite",
    }),
  },
  session: {
    activeOrganization: r.one.organization({
      from: r.session.activeOrganizationId,
      to: r.organization.id,
    }),
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
  organization: {
    invitations: r.many.invitation(),
    members: r.many.member(),
  },
  member: {
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({ from: r.member.userId, to: r.user.id }),
  },
  invitation: {
    inviter: r.one.user({ from: r.invitation.inviterId, to: r.user.id }),
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
    }),
  },
  invite: {
    createdBy: r.one.user({
      from: r.invite.createdByUserId,
      to: r.user.id,
      alias: "createdInvites",
    }),
    usedBy: r.one.user({
      from: r.invite.usedByUserId,
      to: r.user.id,
      alias: "usedInvite",
    }),
  },
}));
