import type { UsageData, UsageSettlement } from "./usage";

export interface UsageStorage {
  getUsage: () => Promise<UsageData | undefined>;
  getSettlement: (settlementId: string) => Promise<UsageSettlement | undefined>;
  putUsage: (data: UsageData) => Promise<void>;
  putSettlement: (settlementId: string, data: UsageSettlement) => Promise<void>;
}

export async function hasSpendAvailableIn(
  storage: Pick<UsageStorage, "getUsage">,
  limitMicroUsd: number
): Promise<boolean> {
  const current = await storage.getUsage();
  return (current?.spentMicroUsd ?? 0) < limitMicroUsd;
}

export async function settleSpendIn(
  storage: UsageStorage,
  settlementId: string,
  spentMicroUsd: number,
  recordedAt = new Date().toISOString()
): Promise<boolean> {
  if (!Number.isSafeInteger(spentMicroUsd) || spentMicroUsd < 0) {
    throw new Error("Assistant settlement must use non-negative microdollars");
  }
  if (await storage.getSettlement(settlementId)) return false;
  const current = await storage.getUsage();
  await storage.putSettlement(settlementId, { recordedAt, spentMicroUsd });
  await storage.putUsage({
    spentMicroUsd: (current?.spentMicroUsd ?? 0) + spentMicroUsd,
  });
  return true;
}
