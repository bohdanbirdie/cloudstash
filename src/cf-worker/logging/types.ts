export interface WideEvent {
  timestamp: string;
  requestId: string;

  service: string;
  version: string;
  commitHash: string;
  region: string;

  method: string;
  path: string;
  query?: Record<string, string>;
  userAgent?: string;
  ip?: string;

  userId?: string;
  orgId?: string;

  statusCode: number;
  durationMs: number;
  outcome: "success" | "error" | "rate_limited";

  error?: {
    type: string;
    message: string;
  };

  [key: string]: unknown;
}

export interface RequestContextData {
  readonly requestId: string;
  readonly startTime: number;
  readonly addField: (key: string, value: unknown) => void;
  readonly addFields: (fields: Record<string, unknown>) => void;
  readonly getFields: () => Record<string, unknown>;
}
