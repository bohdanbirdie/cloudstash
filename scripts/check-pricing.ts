import { BunServices } from "@effect/platform-bun";
import {
  Cause,
  Config,
  ConfigProvider,
  Console,
  Effect,
  Result,
  Exit,
  FileSystem,
  Layer,
  Redacted,
  Schema,
} from "effect";
import StripeSdk from "stripe";

import { PLAN_ORDER, PLANS } from "../src/lib/plan";
import type { BillingInterval, PlanTier } from "../src/lib/plan";

class MissingApiKey extends Schema.TaggedError<MissingApiKey>()(
  "MissingApiKey",
  {}
) {}

class PriceMismatch extends Schema.TaggedError<PriceMismatch>()(
  "PriceMismatch",
  {
    tier: Schema.Literals(PLAN_ORDER),
    interval: Schema.Literals(["month", "year"]),
    detail: Schema.String,
  }
) {}

class PricingDrift extends Schema.TaggedError<PricingDrift>()(
  "PricingDrift",
  {}
) {}

interface Check {
  tier: PlanTier;
  interval: BillingInterval;
  envKey: string;
  expectedUsd: number;
}

const checks: readonly Check[] = PLAN_ORDER.flatMap((tier): Check[] => {
  const pricing = PLANS[tier].pricing;
  if (!pricing) return [];
  return [
    {
      tier,
      interval: "month",
      envKey: `STRIPE_PRICE_${tier.toUpperCase()}`,
      expectedUsd: pricing.monthly,
    },
    {
      tier,
      interval: "year",
      envKey: `STRIPE_PRICE_${tier.toUpperCase()}_YEARLY`,
      expectedUsd: pricing.yearly,
    },
  ];
});

const parseDevVars = (contents: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const line of contents.split("\n")) {
    if (line && !line.startsWith("#")) {
      const [key, ...rest] = line.split("=");
      map.set(key.trim(), rest.join("=").trim());
    }
  }
  return map;
};

const ConfigLive = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const devVars = parseDevVars(
      yield* fs.readFileString(".env").pipe(Effect.orElseSucceed(() => ""))
    );
    return ConfigProvider.layer(
      ConfigProvider.make((path) => {
        const value = devVars.get(path.join("_"));
        return Effect.succeed(
          value === undefined ? undefined : ConfigProvider.makeValue(value)
        );
      }).pipe(ConfigProvider.orElse(ConfigProvider.fromEnv()))
    );
  })
).pipe(Layer.provide(BunServices.layer));

const checkPrice = (stripe: StripeSdk, check: Check) =>
  Effect.gen(function* () {
    const priceId = yield* Config.String(check.envKey).pipe(
      Effect.catchTag("ConfigError", () => Effect.succeed(""))
    );
    if (priceId === "") {
      return yield* new PriceMismatch({
        tier: check.tier,
        interval: check.interval,
        detail: `${check.envKey} not set`,
      });
    }
    const price = yield* Effect.tryPromise({
      try: () => stripe.prices.retrieve(priceId),
      catch: (err) =>
        new PriceMismatch({
          tier: check.tier,
          interval: check.interval,
          detail: err instanceof Error ? err.message : String(err),
        }),
    });
    const problems: string[] = [];
    if (price.unit_amount !== check.expectedUsd * 100) {
      problems.push(
        `Stripe $${(price.unit_amount ?? 0) / 100} vs code $${check.expectedUsd}`
      );
    }
    if (price.currency !== "usd") problems.push(`currency ${price.currency}`);
    if (price.recurring?.interval !== check.interval) {
      problems.push(
        `interval ${price.recurring?.interval} vs ${check.interval}`
      );
    }
    if (!price.active) problems.push("price is archived");
    if (problems.length > 0) {
      return yield* new PriceMismatch({
        tier: check.tier,
        interval: check.interval,
        detail: problems.join(", "),
      });
    }
  });

const program = Effect.gen(function* () {
  const apiKey = yield* Config.Redacted("STRIPE_API_KEY").pipe(
    Effect.catchTag("ConfigError", () =>
      Effect.gen(function* () {
        yield* Console.error(
          "STRIPE_API_KEY not set (.env or env); cannot check."
        );
        return yield* new MissingApiKey({});
      })
    )
  );

  const stripe = new StripeSdk(Redacted.value(apiKey), {
    apiVersion: "2026-04-22.dahlia",
  });

  const results = yield* Effect.forEach(
    checks,
    (check) => Effect.result(checkPrice(stripe, check)),
    { concurrency: "unbounded" }
  );

  let failed = false;
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const result = results[i];
    const label = `${check.tier}/${check.interval}`;
    if (Result.isSuccess(result)) {
      yield* Console.log(`✓ ${label}: $${check.expectedUsd} matches Stripe`);
    } else {
      failed = true;
      yield* Console.error(`✗ ${label}: ${result.failure.detail}`);
    }
  }

  if (failed) {
    yield* Console.error(
      "\nPricing drift between src/lib/plan.ts and Stripe. Update PLANS (or rotate the STRIPE_PRICE_* id) so they agree."
    );
    return yield* new PricingDrift({});
  }
  yield* Console.log("\nAll plan prices match Stripe.");
}).pipe(
  Effect.tapDefect((defect) => Console.error(Cause.pretty(Cause.die(defect))))
);

void Effect.runPromiseExit(program.pipe(Effect.provide(ConfigLive))).then(
  (exit) => {
    if (Exit.isFailure(exit)) {
      process.exitCode = 1;
    }
  }
);
