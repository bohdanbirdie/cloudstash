import { Effect } from 'effect'

import { createAuth } from '../auth'
import { createDb } from '../db'
import type { Env } from '../shared'
import {
  InvalidApiKeyError,
  InvalidUrlError,
  MissingApiKeyError,
  MissingOrgIdError,
  MissingUrlError,
  type IngestError,
} from './errors'

export const handleIngestRequest = (
  request: Request,
  env: Env,
): Effect.Effect<
  { result: { linkId: string; status: string }; ok: boolean },
  IngestError | Error
> =>
  Effect.gen(function* () {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return yield* MissingApiKeyError.make({})
    }
    const apiKey = authHeader.slice(7)

    const db = createDb(env.DB)
    const auth = createAuth(env, db)

    const verifyResult = yield* Effect.tryPromise({
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
      catch: () => InvalidApiKeyError.make({}),
    })

    if (!verifyResult.valid || !verifyResult.key) {
      return yield* InvalidApiKeyError.make({})
    }

    const orgId = verifyResult.key.metadata?.orgId as string | undefined
    if (!orgId) {
      return yield* MissingOrgIdError.make({})
    }

    const body = yield* Effect.tryPromise({
      try: () => request.json() as Promise<{ url?: string }>,
      catch: () => MissingUrlError.make({}),
    })

    if (!body.url) {
      return yield* MissingUrlError.make({})
    }

    try {
      new URL(body.url)
    } catch {
      return yield* InvalidUrlError.make({ url: body.url })
    }

    const storeId = orgId
    const doId = env.LINK_PROCESSOR_DO.idFromName(storeId)
    const stub = env.LINK_PROCESSOR_DO.get(doId)

    const doUrl = new URL('https://do/')
    doUrl.searchParams.set('storeId', storeId)
    doUrl.searchParams.set('ingest', body.url)

    const response = yield* Effect.tryPromise({
      try: () => stub.fetch(doUrl.toString()),
      catch: (error) => new Error(`DO fetch failed: ${error}`),
    })

    const result = yield* Effect.tryPromise({
      try: () => response.json() as Promise<{ linkId: string; status: string }>,
      catch: () => new Error('Failed to parse DO response'),
    })

    return { result, ok: response.ok }
  })

export const ingestRequestToResponse = (
  request: Request,
  env: Env,
): Effect.Effect<Response, never, never> =>
  handleIngestRequest(request, env).pipe(
    Effect.map(({ result, ok }) => Response.json(result, { status: ok ? 200 : 400 })),
    Effect.catchTags({
      MissingApiKeyError: () =>
        Effect.succeed(Response.json({ error: 'Missing API key' }, { status: 401 })),
      InvalidApiKeyError: () =>
        Effect.succeed(Response.json({ error: 'Invalid API key' }, { status: 401 })),
      MissingOrgIdError: () =>
        Effect.succeed(Response.json({ error: 'API key missing orgId metadata' }, { status: 401 })),
      MissingUrlError: () =>
        Effect.succeed(Response.json({ error: 'Missing url' }, { status: 400 })),
      InvalidUrlError: () =>
        Effect.succeed(Response.json({ error: 'Invalid URL' }, { status: 400 })),
    }),
    Effect.catchAll((error) =>
      Effect.succeed(
        Response.json(
          { error: error instanceof Error ? error.message : 'Unknown error' },
          { status: 500 },
        ),
      ),
    ),
  )
