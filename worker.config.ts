import { withDefaultFlags } from "@alchemy.run/cloudflare-runtime/core/internal/constants";

export const WORKER_MAIN = "./src/cf-worker/index.ts";

export const WORKER_FIRST_PATHS = [
  "/sync*",
  "/api/*",
  "/agents/*",
  "/mcp",
  "/.well-known/*",
  "/",
];

export const WORKER_COMPATIBILITY = {
  date: "2026-08-11",
  flags: ["nodejs_compat"],
};

export const WORKER_EFFECTIVE_COMPATIBILITY_FLAGS = withDefaultFlags(
  WORKER_COMPATIBILITY.flags,
  { date: WORKER_COMPATIBILITY.date, isExternal: false }
);

export const WORKER_VARS = {
  EMAIL_FROM: "Cloudstash <noreply@cloudstash.dev>",
  EXTENSION_ID_ALLOWLIST:
    "bdommhffamndfanbpnikgmpjncpcobia,eelfhpgegemfgccaakcmfgldcaojadfj",
};

export const RATE_LIMITS = {
  SYNC_RATE_LIMITER: { limit: 30, period: 60 },
  METADATA_RATE_LIMITER: { limit: 60, period: 60 },
} as const;

export const QUEUE_SETTINGS = {
  linkQueue: { batchSize: 5, maxConcurrency: 1, maxRetries: 5 },
  linkDlq: { batchSize: 5, maxConcurrency: 1, maxRetries: 100 },
  xReconcile: { batchSize: 10, maxConcurrency: 1, maxRetries: 5 },
} as const;

export const DEPLOYED_STAGES = {
  prod: {
    worker: "cloudstash",
    domain: "cloudstash.dev",
    d1: "cloudstash",
    telegramKv: "production-TELEGRAM_KV",
    enrichmentUsageKv: "ENRICHMENT_USAGE",
    linkQueue: "cloudstash-link-queue",
    linkDlq: "cloudstash-link-dlq",
    xReconcileQueue: "cloudstash-x-reconcile",
    usageDataset: "cloudstash_usage",
    accountDeletionWorkflow: "account-deletion",
    rateLimitNamespaceIds: {
      SYNC_RATE_LIMITER: 1001,
      METADATA_RATE_LIMITER: 1002,
    },
  },
  staging: {
    worker: "cloudstash-staging",
    domain: "staging.cloudstash.dev",
    d1: "cloudstash-staging",
    telegramKv: "cloudstash-staging-telegram-kv",
    enrichmentUsageKv: "cloudstash-staging-enrichment-usage",
    linkQueue: "cloudstash-staging-link-queue",
    linkDlq: "cloudstash-staging-link-dlq",
    xReconcileQueue: "cloudstash-staging-x-reconcile",
    usageDataset: "cloudstash_usage_staging",
    accountDeletionWorkflow: "account-deletion-staging",
    rateLimitNamespaceIds: {
      SYNC_RATE_LIMITER: 2001,
      METADATA_RATE_LIMITER: 2002,
    },
  },
} as const;

export type DeployedStage = keyof typeof DEPLOYED_STAGES;

export const isDeployedStage = (stage: string): stage is DeployedStage =>
  Object.hasOwn(DEPLOYED_STAGES, stage);
