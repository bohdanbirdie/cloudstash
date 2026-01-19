/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers"
import { Effect } from "effect"
import { nanoid, type Store } from "@livestore/livestore"
import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare"
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client"

import { schema, tables, events } from "../livestore/schema"
import { fetchOgMetadata } from "./metadata/service"
import {
  fetchAndExtractContent,
  type ExtractedContent,
} from "./content-extractor"
import type { Env } from "./shared"

const AI_MODEL = "@cf/meta/llama-3-8b-instruct"

type LinkStore = Store<typeof schema>

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "link-processor-do" as never
  private store: LinkStore | null = null
  private storeId: string | null = null
  private isInitialized = false

  /**
   * Get or create a stable session ID for this DO instance.
   * Persisted in DO storage so it survives restarts.
   */
  private async getOrCreateSessionId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>("sessionId")
    if (stored) {
      return stored
    }
    const newSessionId = nanoid()
    await this.ctx.storage.put("sessionId", newSessionId)
    return newSessionId
  }

  async initialize(storeId: string): Promise<void> {
    if (this.isInitialized && this.storeId === storeId) {
      return
    }

    this.storeId = storeId
    // Persist storeId so syncUpdateRpc can use it after hibernation
    await this.ctx.storage.put("storeId", storeId)
    const sessionId = await this.getOrCreateSessionId()

    this.store = await createStoreDoPromise({
      schema,
      storeId,
      clientId: "link-processor-do",
      sessionId,
      durableObject: {
        ctx: this.ctx,
        env: this.env,
        bindingName: "LINK_PROCESSOR_DO",
      } as never,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(storeId),
      ) as never,
      livePull: true,
    })

    this.isInitialized = true

    // Subscribe to links table and process new links
    this.store.subscribe(tables.links.where({}), (links) => {
      console.log(`[subscription] links table updated, count: ${links.length}`)
      this.processNewLinks([...links]).catch(console.error)
    })

    console.log(`LinkProcessorDO initialized for store: ${storeId}`)
  }

  // RPC callback for push notifications from sync backend
  async syncUpdateRpc(payload: unknown): Promise<void> {
    console.log("LinkProcessorDO received push notification")

    // Ensure store is initialized before processing
    // Load storeId from storage in case DO was hibernated
    if (!this.isInitialized) {
      const storeId = await this.ctx.storage.get<string>("storeId")
      if (storeId) {
        await this.initialize(storeId)
      } else {
        console.warn("syncUpdateRpc called but no storeId found in storage")
        return
      }
    }

    // Process the sync update - this feeds data to the live pull stream
    await handleSyncUpdateRpc(payload)
  }

  private async processNewLinks(
    links: Array<{ id: string; url: string; deletedAt: Date | null }>,
  ) {
    if (!this.store) return

    console.log(`[processNewLinks] total links: ${links.length}`)

    // Get processing status for all links
    const processingStatuses = this.store.query(
      tables.linkProcessingStatus.where({}),
    )
    const processedIds = new Set(processingStatuses.map((s) => s.linkId))

    console.log(`[processNewLinks] already processed: ${processedIds.size}`, [
      ...processedIds,
    ])

    // Filter to only new, undeleted links
    const newLinks = links.filter(
      (link) => !processedIds.has(link.id) && !link.deletedAt,
    )

    console.log(`[processNewLinks] new links to process: ${newLinks.length}`)

    for (const link of newLinks) {
      await this.processLink(link)
    }
  }

  private async processLink(link: { id: string; url: string }) {
    if (!this.store) return

    const now = new Date()

    try {
      console.log(`Processing link: ${link.id} - ${link.url}`)

      // Mark as processing started
      console.log(
        `[processLink] committing linkProcessingStarted for ${link.id}`,
      )
      this.store.commit(
        events.linkProcessingStarted({
          linkId: link.id,
          updatedAt: now,
        }),
      )
      console.log(
        `[processLink] committed linkProcessingStarted for ${link.id}`,
      )

      // Fetch metadata
      const metadataResult = await Effect.runPromise(
        fetchOgMetadata(link.url).pipe(
          Effect.catchAll((error) => {
            console.error(`Failed to fetch metadata for ${link.url}:`, error)
            return Effect.succeed(null)
          }),
        ),
      )

      if (metadataResult) {
        const snapshotId = nanoid()
        this.store.commit(
          events.linkMetadataFetched({
            id: snapshotId,
            linkId: link.id,
            title: metadataResult.title ?? null,
            description: metadataResult.description ?? null,
            image: metadataResult.image ?? null,
            favicon: metadataResult.favicon ?? null,
            fetchedAt: now,
          }),
        )
        console.log(`Metadata fetched for link: ${link.id}`)
      }

      // Extract page content for AI summary
      const extractedContent = await fetchAndExtractContent(link.url)
      if (extractedContent) {
        console.log(
          `Content extracted for link: ${link.id} (${extractedContent.content.length} chars)`,
        )
      }

      // Generate AI summary using extracted content (or fall back to metadata)
      const summaryContent = await this.generateSummary(
        link.url,
        metadataResult,
        extractedContent,
      )

      if (summaryContent) {
        const summaryId = nanoid()
        console.log(`[processLink] committing linkSummarized for ${link.id}`)
        this.store.commit(
          events.linkSummarized({
            id: summaryId,
            linkId: link.id,
            summary: summaryContent,
            model: AI_MODEL,
            summarizedAt: new Date(),
          }),
        )
        console.log(`[processLink] committed linkSummarized for ${link.id}`)
      }

      // Mark as completed
      this.store.commit(
        events.linkProcessingCompleted({
          linkId: link.id,
          updatedAt: new Date(),
        }),
      )

      console.log(`Link processing completed: ${link.id}`)
    } catch (error) {
      console.error(`Failed to process link ${link.id}:`, error)

      // Mark as failed
      this.store.commit(
        events.linkProcessingFailed({
          linkId: link.id,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        }),
      )
    }
  }

  private async generateSummary(
    url: string,
    metadata: { title?: string; description?: string } | null,
    extractedContent: ExtractedContent | null,
  ): Promise<string | null> {
    try {
      // Build context for the AI - prefer extracted content over metadata
      let content: string

      if (extractedContent?.content) {
        // Use extracted markdown content (truncated to fit context)
        const title = extractedContent.title || metadata?.title || ""
        content = title
          ? `# ${title}\n\n${extractedContent.content}`
          : extractedContent.content
      } else {
        // Fall back to metadata only
        const contentParts: string[] = [`URL: ${url}`]
        if (metadata?.title) {
          contentParts.push(`Title: ${metadata.title}`)
        }
        if (metadata?.description) {
          contentParts.push(`Description: ${metadata.description}`)
        }
        content = contentParts.join("\n")
      }

      // Truncate to ~4000 chars to fit in context window
      const truncatedContent = content.slice(0, 4000)

      const response = await this.env.AI.run(AI_MODEL, {
        messages: [
          {
            role: "system",
            content:
              'Summarize web pages in 2-3 sentences. Output ONLY the summary itself - no preamble, no "Here is a summary", no introductory phrases. Start directly with the content.',
          },
          {
            role: "user",
            content: truncatedContent,
          },
        ],
        max_tokens: 200,
      })

      if ("response" in response && typeof response.response === "string") {
        return response.response.trim()
      }

      return null
    } catch (error) {
      console.error(`Failed to generate summary for ${url}:`, error)
      return null
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const storeId = url.searchParams.get("storeId")

    if (!storeId) {
      return new Response("Missing storeId parameter", { status: 400 })
    }

    await this.initialize(storeId)

    return new Response("LinkProcessorDO initialized", { status: 200 })
  }
}
