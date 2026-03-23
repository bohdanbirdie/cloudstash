import type { Store } from "@livestore/livestore";

import type { schema } from "../../livestore/schema";

export type LivestoreInstance = Store<typeof schema>;

export const AI_MODEL = "@cf/meta/llama-3-8b-instruct";

export interface LinkQueueMessage {
  url: string;
  storeId: string;
  source: string;
  sourceMeta: string | null;
}
