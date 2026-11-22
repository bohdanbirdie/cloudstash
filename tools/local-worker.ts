import type { WorkerEnv } from "../alchemy.run";
import {
  DEPLOYED_STAGES,
  QUEUE_SETTINGS,
  RATE_LIMITS,
  WORKER_COMPATIBILITY,
  WORKER_EFFECTIVE_COMPATIBILITY_FLAGS,
  WORKER_FIRST_PATHS,
  WORKER_VARS,
} from "../worker.config";

const PRODUCTION_NAMES = DEPLOYED_STAGES.prod;

const QUEUE_NAMES = {
  linkQueue: PRODUCTION_NAMES.linkQueue,
  linkDlq: PRODUCTION_NAMES.linkDlq,
  xReconcile: PRODUCTION_NAMES.xReconcileQueue,
};

const consumer = (
  { batchSize, maxRetries }: { batchSize: number; maxRetries: number },
  deadLetterQueue?: string
) => ({ maxBatchSize: batchSize, maxRetries, deadLetterQueue });

const ratelimit = (name: keyof typeof RATE_LIMITS) => ({
  namespace_id: String(PRODUCTION_NAMES.rateLimitNamespaceIds[name]),
  simple: RATE_LIMITS[name],
});

export const localWorkerOptions = (assetsDirectory: string) => ({
  name: PRODUCTION_NAMES.worker,
  compatibilityDate: WORKER_COMPATIBILITY.date,
  compatibilityFlags: WORKER_EFFECTIVE_COMPATIBILITY_FLAGS,
  assets: {
    binding: "ASSETS",
    directory: assetsDirectory,
    run_worker_first: WORKER_FIRST_PATHS,
    routerConfig: { has_user_worker: true },
    assetConfig: { not_found_handling: "single-page-application" as const },
  },
  ai: { binding: "AI" },
  analyticsEngineDatasets: {
    USAGE_ANALYTICS: { dataset: PRODUCTION_NAMES.usageDataset },
  },
  d1Databases: { DB: PRODUCTION_NAMES.d1 },
  kvNamespaces: {
    TELEGRAM_KV: "telegram-kv",
    ENRICHMENT_USAGE: "enrichment-usage",
  },
  durableObjects: {
    SYNC_BACKEND_DO: { className: "SyncBackendDO", useSQLite: true },
    LINK_PROCESSOR_DO: { className: "LinkProcessorDO", useSQLite: true },
    Chat: { className: "ChatAgentDO", useSQLite: true },
    X_BOOKMARK_SYNC_DO: { className: "XBookmarkSyncDO", useSQLite: true },
  },
  workflows: {
    ACCOUNT_DELETION: {
      name: PRODUCTION_NAMES.accountDeletionWorkflow,
      className: "AccountDeletionWorkflow",
    },
  },
  queueProducers: {
    LINK_QUEUE: { queueName: QUEUE_NAMES.linkQueue },
    X_RECONCILE_QUEUE: { queueName: QUEUE_NAMES.xReconcile },
  },
  queueConsumers: {
    [QUEUE_NAMES.linkQueue]: consumer(
      QUEUE_SETTINGS.linkQueue,
      QUEUE_NAMES.linkDlq
    ),
    [QUEUE_NAMES.linkDlq]: consumer(QUEUE_SETTINGS.linkDlq),
    [QUEUE_NAMES.xReconcile]: consumer(QUEUE_SETTINGS.xReconcile),
  },
  ratelimits: {
    SYNC_RATE_LIMITER: ratelimit("SYNC_RATE_LIMITER"),
    METADATA_RATE_LIMITER: ratelimit("METADATA_RATE_LIMITER"),
  },
  bindings: {
    ...WORKER_VARS,
    LINK_QUEUE_NAME: QUEUE_NAMES.linkQueue,
    LINK_DLQ_NAME: QUEUE_NAMES.linkDlq,
    X_RECONCILE_QUEUE_NAME: QUEUE_NAMES.xReconcile,
  },
});

type LocalWorkerOptions = ReturnType<typeof localWorkerOptions>;

type LocalBindingName =
  | "AI"
  | "ASSETS"
  | keyof LocalWorkerOptions["analyticsEngineDatasets"]
  | keyof LocalWorkerOptions["d1Databases"]
  | keyof LocalWorkerOptions["kvNamespaces"]
  | keyof LocalWorkerOptions["durableObjects"]
  | keyof LocalWorkerOptions["workflows"]
  | keyof LocalWorkerOptions["queueProducers"]
  | keyof LocalWorkerOptions["ratelimits"]
  | keyof LocalWorkerOptions["bindings"];

/** Values each test runtime supplies itself: secrets and per-stage settings. */
export type CallerSuppliedBinding = Exclude<keyof WorkerEnv, LocalBindingName>;

export type CallerSuppliedBindings = Record<CallerSuppliedBinding, string>;
