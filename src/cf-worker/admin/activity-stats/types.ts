import { organization } from "../../db/schema";

export type FunnelStage = "signedUp" | "activated" | "engaged" | "active7d";

export type OrgFactRow = Pick<
  typeof organization.$inferSelect,
  "id" | "tier" | "subscriptionStatus" | "createdAt"
> & {
  saves: number;
  saves7d: number;
};

export type Org = Omit<OrgFactRow, "createdAt" | "subscriptionStatus"> & {
  createdAtMs: number;
  isActive7d: boolean;
  isPaying: boolean;
  priceUsd: number;
};

export interface RetentionCell {
  age: number;
  retained: number;
  retainedPct: number;
}

export interface RetentionCohort {
  weekStart: string;
  size: number;
  cells: RetentionCell[];
}

export type { ActivityStats } from "./assemble";
