import { Schema } from "effect";

export const UsageItemId = Schema.Literals([
  "aiSummaries",
  "assistant",
  "externalCalls",
  "xBookmarks",
  "xEnrichments",
]);
export type UsageItemId = typeof UsageItemId.Type;

export const UsageItem = Schema.Struct({
  id: UsageItemId,
  label: Schema.String,
  limit: Schema.Int.check(Schema.isGreaterThan(0)),
  remaining: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type UsageItem = typeof UsageItem.Type;

export const WorkspaceUsageResponse = Schema.Struct({
  items: Schema.Array(UsageItem),
  resetsAt: Schema.String,
});
export type WorkspaceUsageResponse = typeof WorkspaceUsageResponse.Type;

export const usageEndpoint = (workspaceId: string) =>
  `/api/usage?workspaceId=${encodeURIComponent(workspaceId)}`;

export async function fetchWorkspaceUsage(
  url: string
): Promise<WorkspaceUsageResponse> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`Usage failed: ${response.status}`);
  return Schema.decodeUnknownPromise(WorkspaceUsageResponse)(
    await response.json()
  );
}
