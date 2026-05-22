import { eq } from "drizzle-orm";
import { Effect } from "effect";

import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";

export const SIGNUP_GATE_KEY = "signupGateEnabled";

// Gate semantics: enabled = signups require approval. Absent row = open (the
// product default), so new users are auto-approved.
export const parseGateEnabled = (value: string | undefined): boolean =>
  value === "true";

export class AppSettings extends Effect.Service<AppSettings>()(
  "@cloudstash/AppSettings",
  {
    effect: Effect.gen(function* () {
      const db = yield* DbClient;

      return {
        signupGateEnabled: Effect.fn("AppSettings.signupGateEnabled")(
          function* () {
            const row = yield* query(
              db.query.appSettings.findFirst({
                where: eq(schema.appSettings.key, SIGNUP_GATE_KEY),
              })
            );
            return parseGateEnabled(row?.value);
          }
        ),

        setSignupGateEnabled: Effect.fn("AppSettings.setSignupGateEnabled")(
          function* (enabled: boolean) {
            const value = enabled ? "true" : "false";
            yield* query(
              db
                .insert(schema.appSettings)
                .values({ key: SIGNUP_GATE_KEY, value })
                .onConflictDoUpdate({
                  target: schema.appSettings.key,
                  set: { value, updatedAt: new Date() },
                })
            );
            yield* Effect.logInfo("AppSettings.signupGate updated").pipe(
              Effect.annotateLogs({ enabled })
            );
          }
        ),
      };
    }),
  }
) {}
