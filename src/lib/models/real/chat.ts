// muse-spark-1.3 tool calling (POST /v1/chat/completions with tools).
import type OpenAI from 'openai'
import { withTimeout, ModelError, TIMEOUT_MS } from '../types'
import type { ChatModel, ChatMessage } from '../types'
import { meta, SPARK } from './client'

function toOpenAI(m: ChatMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
  if (m.role === 'assistant') return { role: 'assistant', content: m.content,
    ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.arguments } })) } : {}) }
  return { role: m.role, content: m.content }
}

export const realChat: ChatModel = {
  async complete(messages, tools) {
    const res = await withTimeout(meta().chat.completions.create({
      model: SPARK, max_tokens: 8000, reasoning_effort: 'low', messages: messages.map(toOpenAI),
      tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } })),
    }), TIMEOUT_MS, 'chat').catch((e: unknown) => { throw e instanceof ModelError ? e : new ModelError('chat', 'http', e instanceof Error ? e.message : 'request failed') })
    const msg = res.choices[0]?.message
    return {
      content: msg?.content ?? null,
      toolCalls: (msg?.tool_calls ?? []).filter((c) => c.type === 'function').map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
    }
  },
}
