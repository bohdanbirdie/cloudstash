/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers'
import { computed, nanoid, queryDb, type Store, type Unsubscribe } from '@livestore/livestore'
import { createStoreDoPromise, type ClientDoWithRpcCallback } from '@livestore/adapter-cloudflare'
import { handleSyncUpdateRpc } from '@livestore/sync-cf/client'

import { schema, tables } from '../../livestore/schema'
import type { Env } from '../shared'
import { processLink } from './process-link'
import { runEffect } from './logger'

type Link = typeof tables.links.Type

export class LinkProcessorDO extends DurableObject<Env> implements ClientDoWithRpcCallback {
  __DURABLE_OBJECT_BRAND = 'link-processor-do' as never

  private storeId: string | undefined
  private cachedStore: Store<typeof schema> | undefined
  private subscription: Unsubscribe | undefined
  private currentlyProcessing = new Set<string>()

  /** Persisted session ID enables delta sync (only fetch missing events on wakeup) */
  private async getSessionId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>('sessionId')
    if (stored) return stored

    const newSessionId = nanoid()
    await this.ctx.storage.put('sessionId', newSessionId)
    return newSessionId
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) return this.cachedStore

    if (!this.storeId) throw new Error('storeId not set')

    const sessionId = await this.getSessionId()
    console.log('[LinkProcessorDO] Creating store', { storeId: this.storeId, sessionId })

    this.cachedStore = await createStoreDoPromise({
      schema,
      storeId: this.storeId,
      clientId: 'link-processor-do',
      sessionId,
      durableObject: {
        ctx: this.ctx,
        env: this.env,
        bindingName: 'LINK_PROCESSOR_DO',
      } as never,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.storeId),
      ) as never,
      livePull: true,
    })

    return this.cachedStore
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscription) return

    const store = await this.getStore()

    const links$ = queryDb(tables.links.where({ deletedAt: null }))
    const statuses$ = queryDb(tables.linkProcessingStatus.where({}))

    const pendingLinks$ = computed(
      (get) => {
        const links = get(links$)
        const statuses = get(statuses$)
        const statusMap = new Map(statuses.map((s) => [s.linkId, s]))

        return links.filter((link) => {
          const status = statusMap.get(link.id)
          return !status || status.status === 'pending'
        })
      },
      { label: 'pendingLinks' },
    )

    this.subscription = store.subscribe(pendingLinks$, (pendingLinks) => {
      console.log('[LinkProcessorDO] Subscription fired', { pendingCount: pendingLinks.length })
      this.onPendingLinksChanged(store, pendingLinks)
    })
  }

  private onPendingLinksChanged(store: Store<typeof schema>, pendingLinks: readonly Link[]): void {
    for (const link of pendingLinks) {
      if (this.currentlyProcessing.has(link.id)) continue

      const existingStatus = store.query(
        queryDb(tables.linkProcessingStatus.where({ linkId: link.id })),
      )
      const isRetry = existingStatus.length > 0 && existingStatus[0].status === 'pending'

      this.processLinkAsync(store, link, isRetry).catch((err) => {
        console.error('[LinkProcessorDO] processLinkAsync error', { linkId: link.id, error: err })
      })
    }
  }

  private async processLinkAsync(
    store: Store<typeof schema>,
    link: Link,
    isRetry: boolean,
  ): Promise<void> {
    this.currentlyProcessing.add(link.id)
    console.log('[LinkProcessorDO] Processing', { linkId: link.id, url: link.url, isRetry })

    try {
      await runEffect(processLink({ link: { id: link.id, url: link.url }, store, env: this.env, isRetry }))
    } finally {
      this.currentlyProcessing.delete(link.id)
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId')

    if (!storeId) return new Response('Missing storeId', { status: 400 })

    this.storeId = storeId
    await this.ctx.storage.put('storeId', storeId)
    await this.ensureSubscribed()

    return new Response('OK')
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.storeId) {
      this.storeId = await this.ctx.storage.get<string>('storeId')
    }

    if (this.storeId) {
      await this.ensureSubscribed()
    }

    await handleSyncUpdateRpc(payload)
  }
}
