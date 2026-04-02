import type { Store } from "@livestore/livestore";

import type { schema } from "../../livestore/schema";
import type { OrgId } from "../db/branded";

export type LivestoreInstance = Store<typeof schema>;

export const AI_MODEL = "@cf/meta/llama-3-8b-instruct";

export interface LinkQueueMessage {
  url: string;
  storeId: OrgId;
  source: string;
  sourceMeta: string | null;
}
