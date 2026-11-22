import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import type {
  AccountDeletionWorkflow,
  ChatAgentDO,
  LinkProcessorDO,
  SyncBackendDO,
  XBookmarkSyncDO,
} from "./src/cf-worker/index";
import {
  PRODUCTION_NAMES,
  QUEUE_SETTINGS,
  RATE_LIMITS,
  WORKER_COMPATIBILITY,
  WORKER_FIRST_PATHS,
  WORKER_MAIN,
  WORKER_VARS,
} from "./worker.config";

const PRODUCTION_STAGE = "prod";

const requiredSecret = (name: string) =>
  Config.schema(Schema.Redacted(Schema.NonEmptyString), name);

const optionalString = (name: string) =>
  Config.String(name).pipe(Config.withDefault(""));

export const App = Effect.gen(function* () {
  const { stage } = yield* Alchemy.Stack;
  const production = stage === PRODUCTION_STAGE;
  const protect = Alchemy.RemovalPolicy.protect(production);
  const cfAccountId = production
    ? (yield* Cloudflare.CloudflareEnvironment.current).accountId
    : optionalString("CF_ACCOUNT_ID");

  const secret = (name: string) =>
    production
      ? requiredSecret(name)
      : Config.Redacted(name).pipe(Config.withDefault(Redacted.make("")));

  const db = yield* Cloudflare.D1.Database("DB", {
    name: production ? PRODUCTION_NAMES.d1 : undefined,
    migrations: "./drizzle/migrations",
  }).pipe(protect);

  const telegramKv = yield* Cloudflare.KV.Namespace("TelegramKV", {
    title: production ? PRODUCTION_NAMES.telegramKv : undefined,
  }).pipe(protect);

  const enrichmentUsage = yield* Cloudflare.KV.Namespace("EnrichmentUsage", {
    title: production ? PRODUCTION_NAMES.enrichmentUsageKv : undefined,
  }).pipe(protect);

  const linkQueue = yield* Cloudflare.Queues.Queue("LinkQueue", {
    name: production ? PRODUCTION_NAMES.linkQueue : undefined,
  }).pipe(protect);

  const linkDlq = yield* Cloudflare.Queues.Queue("LinkDlq", {
    name: production ? PRODUCTION_NAMES.linkDlq : undefined,
  }).pipe(protect);

  const xReconcileQueue = yield* Cloudflare.Queues.Queue("XReconcileQueue", {
    name: production ? PRODUCTION_NAMES.xReconcileQueue : undefined,
  }).pipe(protect);

  const worker = yield* Cloudflare.Website.Vite("Worker", {
    name: production ? PRODUCTION_NAMES.worker : undefined,
    main: WORKER_MAIN,
    domain: production ? PRODUCTION_NAMES.domain : undefined,
    workersDev: { enabled: true, previewsEnabled: true },
    compatibility: WORKER_COMPATIBILITY,
    crons: ["17 4 * * *"],
    assets: {
      notFoundHandling: "single-page-application",
      runWorkerFirst: WORKER_FIRST_PATHS,
    },
    observability: {
      enabled: true,
      logs: { enabled: true, invocationLogs: true },
      traces: { enabled: true, headSamplingRate: 1 },
    },
    dev: { port: Number(process.env.PORT) || 3000 },
    env: {
      ...WORKER_VARS,
      DB: db,
      TELEGRAM_KV: telegramKv,
      ENRICHMENT_USAGE: enrichmentUsage,
      LINK_QUEUE: linkQueue,
      X_RECONCILE_QUEUE: xReconcileQueue,
      LINK_QUEUE_NAME: linkQueue.queueName,
      LINK_DLQ_NAME: linkDlq.queueName,
      X_RECONCILE_QUEUE_NAME: xReconcileQueue.queueName,
      AI: Cloudflare.Workers.AI(),
      USAGE_ANALYTICS: Cloudflare.AnalyticsEngine.Dataset("UsageAnalytics", {
        dataset: production
          ? PRODUCTION_NAMES.usageDataset
          : `cloudstash_usage_${stage}`,
      }),
      SYNC_RATE_LIMITER: Cloudflare.RateLimit("SYNC_RATE_LIMITER", {
        namespaceId: RATE_LIMITS.SYNC_RATE_LIMITER.namespaceId,
        simple: {
          limit: RATE_LIMITS.SYNC_RATE_LIMITER.limit,
          period: RATE_LIMITS.SYNC_RATE_LIMITER.period,
        },
      }),
      METADATA_RATE_LIMITER: Cloudflare.RateLimit("METADATA_RATE_LIMITER", {
        namespaceId: RATE_LIMITS.METADATA_RATE_LIMITER.namespaceId,
        simple: {
          limit: RATE_LIMITS.METADATA_RATE_LIMITER.limit,
          period: RATE_LIMITS.METADATA_RATE_LIMITER.period,
        },
      }),
      SYNC_BACKEND_DO: Cloudflare.DurableObject<SyncBackendDO>(
        "SyncBackendDO",
        {
          className: "SyncBackendDO",
        }
      ),
      LINK_PROCESSOR_DO: Cloudflare.DurableObject<LinkProcessorDO>(
        "LinkProcessorDO",
        {
          className: "LinkProcessorDO",
        }
      ),
      Chat: Cloudflare.DurableObject<ChatAgentDO>("ChatAgentDO", {
        className: "ChatAgentDO",
      }),
      X_BOOKMARK_SYNC_DO: Cloudflare.DurableObject<XBookmarkSyncDO>(
        "XBookmarkSyncDO",
        {
          className: "XBookmarkSyncDO",
        }
      ),
      ACCOUNT_DELETION: Cloudflare.Workflow<
        Parameters<AccountDeletionWorkflow["run"]>[0]["payload"]
      >("AccountDeletion", {
        className: "AccountDeletionWorkflow",
        workflowName: production
          ? PRODUCTION_NAMES.accountDeletionWorkflow
          : undefined,
      }),
      BETTER_AUTH_URL: production
        ? "https://cloudstash.dev"
        : Config.String("BETTER_AUTH_URL"),
      ...(production
        ? {}
        : {
            AI_METER_LIMIT: optionalString("AI_METER_LIMIT"),
            PUBLIC_URL: optionalString("PUBLIC_URL"),
            ENABLE_TEST_AUTH: optionalString("ENABLE_TEST_AUTH"),
          }),
      BETTER_AUTH_SECRET: requiredSecret("BETTER_AUTH_SECRET"),
      GOOGLE_CLIENT_ID: requiredSecret("GOOGLE_CLIENT_ID"),
      GOOGLE_CLIENT_SECRET: requiredSecret("GOOGLE_CLIENT_SECRET"),
      OPENROUTER_API_KEY: secret("OPENROUTER_API_KEY"),
      RESEND_API_KEY: secret("RESEND_API_KEY"),
      X_CLIENT_ID: secret("X_CLIENT_ID"),
      X_CLIENT_SECRET: secret("X_CLIENT_SECRET"),
      TELEGRAM_BOT_TOKEN: secret("TELEGRAM_BOT_TOKEN"),
      TELEGRAM_WEBHOOK_SECRET: secret("TELEGRAM_WEBHOOK_SECRET"),
      STRIPE_API_KEY: secret("STRIPE_API_KEY"),
      STRIPE_WEBHOOK_SECRET: secret("STRIPE_WEBHOOK_SECRET"),
      STRIPE_PRICE_PLUS: secret("STRIPE_PRICE_PLUS"),
      STRIPE_PRICE_PLUS_YEARLY: secret("STRIPE_PRICE_PLUS_YEARLY"),
      STRIPE_PRICE_PRO: secret("STRIPE_PRICE_PRO"),
      STRIPE_PRICE_PRO_YEARLY: secret("STRIPE_PRICE_PRO_YEARLY"),
      CF_ACCOUNT_ID: cfAccountId,
      CF_ANALYTICS_TOKEN: secret("CF_ANALYTICS_TOKEN"),
    },
  }).pipe(protect);

  yield* Cloudflare.Queues.Consumer("LinkQueueConsumer", {
    queueId: linkQueue.queueId,
    scriptName: worker.workerName,
    deadLetterQueue: linkDlq.queueName,
    settings: QUEUE_SETTINGS.linkQueue,
  });

  yield* Cloudflare.Queues.Consumer("LinkDlqConsumer", {
    queueId: linkDlq.queueId,
    scriptName: worker.workerName,
    settings: QUEUE_SETTINGS.linkDlq,
  });

  yield* Cloudflare.Queues.Consumer("XReconcileConsumer", {
    queueId: xReconcileQueue.queueId,
    scriptName: worker.workerName,
    settings: QUEUE_SETTINGS.xReconcile,
  });

  return worker;
});

export type WorkerEnv = Cloudflare.InferEnv<typeof App>;

export default Alchemy.Stack(
  "Cloudstash",
  {
    providers: Cloudflare.providers(),
    state: Layer.unwrap(
      Effect.map(Alchemy.Stage, (stage) =>
        stage === PRODUCTION_STAGE ? Cloudflare.state() : Alchemy.localState()
      )
    ),
    secrets: ({ stage }) =>
      stage === PRODUCTION_STAGE
        ? Alchemy.Secrets.ProcessEnv()
        : [Alchemy.Secrets.DotEnv(), Alchemy.Secrets.ProcessEnv()],
  },
  Effect.gen(function* () {
    const worker = yield* App;
    return { url: worker.url };
  })
);
