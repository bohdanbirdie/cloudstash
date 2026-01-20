import type { Store } from '@livestore/livestore'
import type { schema } from '../../livestore/schema'

export type LinkStore = Store<typeof schema>

export const AI_MODEL = '@cf/meta/llama-3-8b-instruct'
