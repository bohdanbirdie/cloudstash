/// <reference types="@cloudflare/workers-types" />
import type { SyncBackendDO } from "./index"
import type { LinkProcessorDO } from "./link-processor-do"

export type Env = {
  SYNC_BACKEND_DO: DurableObjectNamespace<SyncBackendDO>
  LINK_PROCESSOR_DO: DurableObjectNamespace<LinkProcessorDO>
  AI: Ai
}
