import type { Store } from "@livestore/livestore";

import type { schema } from "../../livestore/schema";
import type { OrgId } from "../db/branded";

export type LivestoreInstance = Store<typeof schema>;

// IFEval 92.1 + BFCL 77.3 — the high IFEval is what makes the model reliably
// emit tool-call arguments matching our schema (smaller models drift, e.g.
// returning suggestedTags as a comma-separated string instead of an array).
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const MAX_CONCURRENT_METADATA = 8;
export const MAX_CONCURRENT_AI = 3;

export interface LinkQueueMessage {
  url: string;
  storeId: OrgId;
  source: string;
  sourceMeta: string | null;
}
