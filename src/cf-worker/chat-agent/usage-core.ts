import type { UsageData } from "./usage";

export interface UsageStorage {
  get: () => Promise<UsageData | undefined>;
  put: (data: UsageData) => Promise<void>;
}

export async function reserveTokensIn(
  storage: UsageStorage,
  estimate: number,
  limit: number
): Promise<boolean> {
  const current = await storage.get();
  const used =
    (current?.promptTokens ?? 0) +
    (current?.completionTokens ?? 0) +
    (current?.reservedTokens ?? 0);
  if (used + estimate > limit) return false;
  await storage.put({
    completionTokens: current?.completionTokens ?? 0,
    promptTokens: current?.promptTokens ?? 0,
    reservedTokens: (current?.reservedTokens ?? 0) + estimate,
  });
  return true;
}

export async function reconcileTokenUsageIn(
  storage: UsageStorage,
  promptTokens: number,
  completionTokens: number,
  releaseReservation: number
): Promise<void> {
  const current = await storage.get();
  const reserved = current?.reservedTokens ?? 0;
  await storage.put({
    completionTokens: (current?.completionTokens ?? 0) + completionTokens,
    promptTokens: (current?.promptTokens ?? 0) + promptTokens,
    reservedTokens: Math.max(0, reserved - releaseReservation),
  });
}
