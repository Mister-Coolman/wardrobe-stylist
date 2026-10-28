// Meta Model API (https://dev.meta.ai/docs) — OpenAI-compatible chat completions, plus the
// Responses, Images and ASR endpoints called directly. Base URL defaults to https://api.meta.ai/v1.
import OpenAI from 'openai'
import sharp from 'sharp'
import type { ZodType } from 'zod'
import { z } from 'zod'
import { getStorage } from '@/lib/storage'
import { ModelError, TIMEOUT_MS, withTimeout } from '../types'

export const BASE_URL = () => (process.env.META_API_BASE_URL || 'https://api.meta.ai/v1').replace(/\/$/, '')
export const SPARK = 'muse-spark-1.3'

let client: OpenAI | null = null
export function meta(): OpenAI {
  if (!process.env.META_API_KEY) throw new ModelError('client', 'unavailable', 'META_API_KEY is not set')
  client ??= new OpenAI({ baseURL: BASE_URL(), apiKey: process.env.META_API_KEY, maxRetries: 1 })
  return client
}

/** Direct call for endpoints the SDK doesn't model; non-2xx becomes ModelError('http'). */
export async function metaFetch(adapter: string, path: string, init: RequestInit, ms = TIMEOUT_MS): Promise<Response> {
  if (!process.env.META_API_KEY) throw new ModelError(adapter, 'unavailable', 'META_API_KEY is not set')
  const res = await withTimeout(fetch(`${BASE_URL()}${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, ...init.headers },
  }), ms, adapter)
  if (!res.ok) throw new ModelError(adapter, 'http', `${path} → ${res.status} ${(await res.text()).slice(0, 300)}`)
  return res
}

/** App media (/api/media/…, /fixtures/…) as a data: URL the API can read. SVG is rasterized; large images are capped. */
export async function toDataUrl(url: string, maxEdge = 1024): Promise<string> {
  if (/^(data:|https?:)/.test(url)) return url
  const raw = await getStorage().read(url)
  const img = sharp(raw, { density: 200 }).resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: !url.endsWith('.svg') })
  const isAlpha = url.endsWith('.png') || url.endsWith('.svg')
  const out = isAlpha ? await img.png().toBuffer() : await img.jpeg({ quality: 85 }).toBuffer()
  return `data:image/${isAlpha ? 'png' : 'jpeg'};base64,${out.toString('base64')}`
}

/** One structured-output chat call, parsed with zod; one retry on bad output. */
export type Effort = 'minimal' | 'low' | 'medium' | 'high'

/** Reasoning tokens count against max_tokens, so the budget is generous and effort is set per job. */
export async function structured<T>(adapter: string, schema: ZodType<T>, name: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[], opts: { ms?: number; effort?: Effort } = {}): Promise<T> {
  const ms = opts.ms ?? TIMEOUT_MS
  let last = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await withTimeout(meta().chat.completions.create({
      model: SPARK, messages, max_tokens: 16_000, reasoning_effort: opts.effort ?? 'low',
      response_format: { type: 'json_schema', json_schema: { name, schema: z.toJSONSchema(schema) as Record<string, unknown> } },
    }), ms, adapter).catch((e: unknown) => { throw e instanceof ModelError ? e : new ModelError(adapter, 'http', e instanceof Error ? e.message : 'request failed') })
    last = res.choices[0]?.message?.content ?? ''
    if (!last) last = `(empty: finish_reason=${res.choices[0]?.finish_reason}, completion_tokens=${res.usage?.completion_tokens}, reasoning=${res.usage?.completion_tokens_details?.reasoning_tokens})`
    try {
      const parsed = schema.safeParse(JSON.parse(last))
      if (parsed.success) return parsed.data
    } catch { /* retry */ }
  }
  throw new ModelError(adapter, 'bad_output', `unparseable ${name}: ${last.slice(0, 200)}`)
}
