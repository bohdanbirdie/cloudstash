import { readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const configPath = path.join(root, "dist/cloudstash/wrangler.json");

const fail = (message: string): never => {
  throw new Error(
    `${message}\nRun \`bun run build:staging\` before deploying staging.`
  );
};

const config = await readFile(configPath, "utf8")
  .then((contents) => JSON.parse(contents) as Record<string, unknown>)
  .catch((error: unknown) =>
    fail(
      `Could not read the generated staging Worker configuration: ${String(error)}`
    )
  );

if (config.name !== "cloudstash-staging") {
  fail(
    `Expected a cloudstash-staging artifact, received ${JSON.stringify(config.name)}.`
  );
}

const vars = config.vars as Record<string, unknown> | undefined;
if (vars?.BETTER_AUTH_URL !== "https://staging.cloudstash.dev") {
  fail("The generated artifact does not use the staging public origin.");
}

const hasStagingDomain = (
  config.routes as ReadonlyArray<Record<string, unknown>> | undefined
)?.some(
  ({ pattern, custom_domain }) =>
    pattern === "staging.cloudstash.dev" && custom_domain === true
);
if (!hasStagingDomain) {
  fail("The generated artifact does not declare the staging custom domain.");
}

const database = (
  config.d1_databases as ReadonlyArray<Record<string, unknown>> | undefined
)?.find(({ binding }) => binding === "DB");
if (database?.database_name !== "cloudstash-staging") {
  fail("The generated artifact is not bound to the staging D1 database.");
}

const queue = (
  config.queues as
    | { producers?: ReadonlyArray<Record<string, unknown>> }
    | undefined
)?.producers?.find(({ binding }) => binding === "LINK_QUEUE");
if (queue?.queue !== "cloudstash-staging-link-queue") {
  fail("The generated artifact is not bound to the staging Queue.");
}

console.log("Verified isolated cloudstash-staging deploy artifact.");
