/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers'
import { Effect } from 'effect'
import { nanoid } from '@livestore/livestore'
import { createStoreDoPromise, type ClientDoWithRpcCallback } from '@livestore/adapter-cloudflare'
import { handleSyncUpdateRpc } from '@livestore/sync-cf/client'

import { schema, tables } from '../../livestore/schema'
import type { Env } from '../shared'
import { runEffect } from './logger'
import { processLink } from './process-link'
import type { LinkStore } from './types'

/**
 * LinkProcessorDO processes links by fetching metadata and generating AI summaries.
 *
 * Lifecycle (designed for hibernation):
 * 1. Woken up via fetch (triggered by SyncBackendDO.onPush when link created)
 * 2. Creates store, syncs data, processes all pending links
 * 3. Shuts down store to close connections
 * 4. Hibernates until next wakeup
 */
export class LinkProcessorDO extends DurableObject<Env> implements ClientDoWithRpcCallback {
  __DURABLE_OBJECT_BRAND = 'link-processor-do' as never

  private constructedAt = Date.now()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    console.log('[LinkProcessorDO] Waking up (constructor called)', {
      constructedAt: new Date().toISOString(),
    })
  }

  /**
   * Get or create a stable session ID for this DO instance.
   * Persisted so the DO can resume from cached events instead of fetching all.
   * ServerAheadError may occur if state diverges, but livestore handles recovery.
   */
  private async getOrCreateSessionId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>('sessionId')
    if (stored) {
      return stored
    }
    const newSessionId = nanoid()
    await this.ctx.storage.put('sessionId', newSessionId)
    return newSessionId
  }

  /**
   * Creates a fresh store, processes all pending links, then shuts down.
   * This allows the DO to hibernate between processing runs.
   */
  private async processAndShutdown(storeId: string): Promise<void> {
    await runEffect(
      Effect.logInfo('Creating store for processing').pipe(Effect.annotateLogs({ storeId })),
    )

    await this.ctx.storage.put('storeId', storeId)
    const sessionId = await this.getOrCreateSessionId()

    const store = await createStoreDoPromise({
      schema,
      storeId,
      clientId: 'link-processor-do',
      sessionId,
      durableObject: {
        ctx: this.ctx,
        env: this.env,
        bindingName: 'LINK_PROCESSOR_DO',
      } as never,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(storeId),
      ) as never,
      livePull: false, // No need for live updates - we process and shutdown
    })

    await runEffect(
      Effect.logInfo('Store created, processing links').pipe(
        Effect.annotateLogs({ storeId, sessionId }),
      ),
    )

    try {
      await this.processAllPendingLinks(store)
    } finally {
      // Always shutdown store to allow hibernation
      await runEffect(Effect.logInfo('Shutting down store to allow hibernation'))
      await store.shutdownPromise()
      await runEffect(Effect.logInfo('Store shutdown complete - DO can now hibernate'))
    }
  }

  /**
   * Process all links that need processing (new or stuck).
   */
  private async processAllPendingLinks(store: LinkStore): Promise<void> {
    const env = this.env

    const program = Effect.gen(function* () {
      const links = store.query(tables.links.where({}))
      yield* Effect.logInfo(`Processing links batch: ${links.length} total links`)

      const processingStatuses = store.query(tables.linkProcessingStatus.where({}))
      const statusByLinkId = new Map(processingStatuses.map((s) => [s.linkId, s]))

      yield* Effect.logDebug(`Processing status check: ${statusByLinkId.size} links have status`)

      // Find links that need processing:
      // 1. New links (no status)
      // 2. Stuck links (status = "pending" for more than 5 minutes)
      const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
      const now = Date.now()

      const linksToProcess = links.filter((link) => {
        if (link.deletedAt) return false

        const status = statusByLinkId.get(link.id)
        if (!status) return true // New link, no status yet

        // Retry stuck links (pending for too long)
        if (status.status === 'pending') {
          const stuckTime = now - status.updatedAt.getTime()
          if (stuckTime > STUCK_THRESHOLD_MS) {
            return true
          }
        }

        return false
      })

      const newLinks = linksToProcess.filter((l) => !statusByLinkId.has(l.id))
      const retryLinks = linksToProcess.filter((l) => statusByLinkId.has(l.id))

      yield* Effect.logInfo(
        `Links to process: ${linksToProcess.length} (${newLinks.length} new, ${retryLinks.length} stuck/retry)`,
      )

      // Process new links
      for (const link of newLinks) {
        yield* processLink({ link, store, env, isRetry: false })
      }

      // Retry stuck links
      for (const link of retryLinks) {
        yield* processLink({ link, store, env, isRetry: true })
      }

      yield* Effect.logInfo('All pending links processed')
    })

    await runEffect(program)
  }

  /**
   * Handle push notifications from sync backend.
   * Re-processes links if needed.
   */
  async syncUpdateRpc(payload: unknown): Promise<void> {
    await runEffect(Effect.logDebug('Received push notification (syncUpdateRpc)'))

    const storeId = await this.ctx.storage.get<string>('storeId')
    if (storeId) {
      await runEffect(
        Effect.logInfo('Processing due to sync update').pipe(
          Effect.annotateLogs({ storeId, trigger: 'syncUpdateRpc' }),
        ),
      )
      await this.processAndShutdown(storeId)
    } else {
      await runEffect(
        Effect.logWarning('syncUpdateRpc called but no storeId in storage - ignoring'),
      )
    }

    await handleSyncUpdateRpc(payload)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId')

    const instanceAge = Date.now() - this.constructedAt
    await runEffect(
      Effect.logInfo('Fetch request received').pipe(
        Effect.annotateLogs({
          storeId,
          path: url.pathname,
          trigger: 'fetch',
          instanceAgeMs: instanceAge,
          instanceAgeMin: Math.round(instanceAge / 60000),
        }),
      ),
    )

    if (!storeId) {
      await runEffect(Effect.logWarning('Missing storeId parameter'))
      return new Response('Missing storeId parameter', { status: 400 })
    }

    try {
      await this.processAndShutdown(storeId)
      return new Response('LinkProcessorDO processed and shutdown', { status: 200 })
    } catch (error) {
      await runEffect(
        Effect.logError('Processing failed').pipe(
          Effect.annotateLogs({
            storeId,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      )
      return new Response('Processing failed', { status: 500 })
    }
  }
}
