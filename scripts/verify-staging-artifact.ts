import { readFile } from "node:fs/promises";
import path from "node:path";

import { Schema } from "effect";

const root = path.resolve(import.meta.dir, "..");
const configPath = path.join(root, "dist/cloudstash/wrangler.json");

const fail = (message: string): never => {
  throw new Error(
    `${message}\nRun \`bun run build:staging\` before deploying staging.`
  );
};

const GeneratedWorkerConfig = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  vars: Schema.optionalKey(
    Schema.Struct({
      BETTER_AUTH_URL: Schema.optionalKey(Schema.String),
    })
  ),
  routes: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        pattern: Schema.optionalKey(Schema.String),
        custom_domain: Schema.optionalKey(Schema.Boolean),
      })
    )
  ),
  d1_databases: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        binding: Schema.optionalKey(Schema.String),
        database_name: Schema.optionalKey(Schema.String),
      })
    )
  ),
  queues: Schema.optionalKey(
    Schema.Struct({
      producers: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            binding: Schema.optionalKey(Schema.String),
            queue: Schema.optionalKey(Schema.String),
          })
        )
      ),
    })
  ),
});

const rawConfig = await readFile(configPath, "utf8")
  .then((contents) => JSON.parse(contents))
  .catch((error) =>
    fail(
      `Could not read the generated staging Worker configuration: ${String(error)}`
    )
  );

const config = await Schema.decodeUnknownPromise(GeneratedWorkerConfig)(
  rawConfig
).catch((error) =>
  fail(
    `The generated staging Worker configuration has an invalid shape: ${String(error)}`
  )
);

if (config.name !== "cloudstash-staging") {
  fail(
    `Expected a cloudstash-staging artifact, received ${JSON.stringify(config.name)}.`
  );
}

if (config.vars?.BETTER_AUTH_URL !== "https://staging.cloudstash.dev") {
  fail("The generated artifact does not use the staging public origin.");
}

const hasStagingDomain = config.routes?.some(
  ({ pattern, custom_domain }) =>
    pattern === "staging.cloudstash.dev" && custom_domain === true
);
if (!hasStagingDomain) {
  fail("The generated artifact does not declare the staging custom domain.");
}

const database = config.d1_databases?.find(({ binding }) => binding === "DB");
if (database?.database_name !== "cloudstash-staging") {
  fail("The generated artifact is not bound to the staging D1 database.");
}

const queues = config.queues?.producers;
const linkQueue = queues?.find(({ binding }) => binding === "LINK_QUEUE");
if (linkQueue?.queue !== "cloudstash-staging-link-queue") {
  fail("The generated artifact is not bound to the staging Queue.");
}

const xQueue = queues?.find(({ binding }) => binding === "X_RECONCILE_QUEUE");
if (xQueue?.queue !== "cloudstash-staging-x-reconcile") {
  fail("The generated artifact is not bound to the staging X Queue.");
}

console.log("Verified isolated cloudstash-staging deploy artifact.");
