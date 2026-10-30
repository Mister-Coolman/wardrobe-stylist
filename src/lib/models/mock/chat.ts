import type { ChatMessage, ChatModel, ToolCall } from '../types'

const id = () => `call_${Math.random().toString(36).slice(2, 8)}`
const tool = (name: string, args: object = {}): ToolCall => ({ id: id(), name, arguments: JSON.stringify(args) })
const calls = (...c: ToolCall[]) => ({ content: null, toolCalls: c })
const say = (content: string) => ({ content, toolCalls: [] })

/** Pieces of the outfit in view: the quoted one, else the newest outfit card in the thread ("[outfit id for date: Name (id), …]"). */
function outfitInView(messages: ChatMessage[], quoted?: string) {
  const texts = [quoted ?? '', ...messages.filter((m) => m.role === 'assistant').map((m) => m.content ?? '').reverse()]
  for (const t of texts) {
    const m = [...t.matchAll(/\[outfit (\S+) for [\d-]+: ([^\]]+)\]/g)].at(-1)
    if (m) return { outfitId: m[1], pieces: [...m[2].matchAll(/([^,]+?) \(([^)]+)\)/g)].map((x) => ({ name: x[1].trim(), id: x[2] })) }
  }
  return null
}

/** Scripted agent: maps phrases to tool calls, then summarizes the tool results. */
export const mockChat: ChatModel = {
  async complete(messages) {
    const users = messages.filter((m): m is Extract<ChatMessage, { role: 'user' }> => m.role === 'user')
    const userMsg = users.at(-1)
    const raw = userMsg?.content ?? ''
    const text = raw.toLowerCase()
    const last = messages[messages.length - 1]

    if (last.role === 'tool') {
      const asked = [...messages].reverse().find((m) => m.role === 'assistant' && m.toolCalls?.length)
      const ran = asked?.role === 'assistant' ? asked.toolCalls!.map((c) => c.name) : []
      const result = (() => { try { return JSON.parse(last.content) } catch { return {} } })()
      // follow-ups that need the ids a search found
      if (ran.includes('search_wardrobe') && result.pieces?.length) {
        const first = result.pieces[0].id
        if (/spilled|stain|dirty|in the wash|laundry/.test(text)) return calls(tool('set_status', { ids: [first], status: 'laundry' }))
        if (/^yes,? delete/.test(text)) return calls(tool('delete_piece', { id: first, confirm: true }))
      }
      return say(result.summary ?? (result.error ? `That didn’t work: ${result.error}.` : 'Done.'))
    }

    const date = (text.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
    const dated = date ? { date } : {}
    const outfit = outfitInView(messages.slice(0, -1), userMsg?.quoted)

    if (/pack|trip/.test(text)) {
      const city = (raw.match(/(?:to|for)\s+([A-Z][\w ]+?)(?:\s+(?:for|from|on)\b|[.,?!]|$)/) ?? [])[1] ?? 'Chicago'
      return calls(tool('plan_trip', { destination: city.trim(), days: 3 }))
    }
    if (/^another (look|one)/.test(text)) return calls(tool('another_look', dated))
    if (/^(i )?wore it/.test(text)) return outfit ? calls(tool('log_wear', { outfitId: outfit.outfitId })) : say('Which look?')
    if (/^swap a piece$/.test(text)) return say('Which piece, and for what? Say “swap the jeans for something smarter”.')
    const swap = text.match(/swap (?:the |my )?(.+?)(?: for (.+))?$/)
    if (swap && outfit) {
      const piece = outfit.pieces.find((p) => p.name.toLowerCase().includes(swap[1].trim()))
      if (!piece) return say(`There’s no ${swap[1]} in that look.`)
      return calls(tool('swap_piece', { outfitId: outfit.outfitId, drop: [piece.id], ...(swap[2] ? { wish: swap[2] } : {}) }))
    }
    if (/spilled|stain|dirty|in the wash|laundry/.test(text)) {
      const what = text.match(/on (?:the |my )?([\w ]+?)(?:[.,!?]|$)/)?.[1]
      return what ? calls(tool('search_wardrobe', { query: what })) : say('Which piece?')
    }
    const del = text.match(/^(?:delete|remove|get rid of) (?:the |my )?(.+?)[.!?]?$/)
    if (del) return say(`Delete the ${del[1]} for good? Say “yes, delete”.`)
    if (/^yes,? delete/.test(text)) {
      const asked = [...users].reverse().slice(1).map((m) => m.content.toLowerCase().match(/^(?:delete|remove|get rid of) (?:the |my )?(.+?)[.!?]?$/)).find(Boolean)
      return asked ? calls(tool('search_wardrobe', { query: asked[1] })) : say('Delete what?')
    }
    const add = text.match(/^add (?:listing )?(\d+)$/)
    if (add) return calls(tool('add_listing', { number: Number(add[1]) }))
    const shop = raw.match(/^(?:find|search for|look up|add my) (.+)$/i)
    if (shop) return calls(tool('shop_search', { query: shop[1] }))

    const ev = text.match(/(drinks|dinner|date|gym|run|yoga|interview|client|wedding|party)[^.?!]*/)
    if (ev) return calls(tool('add_event', { title: ev[0].trim(), ...dated }), tool('plan_outfit', dated))
    const theme = text.match(/(\w+) themed/)
    if (/wear|outfit|look/.test(text)) return calls(tool('plan_outfit', { ...dated, ...(theme ? { wish: `${theme[1]} themed` } : {}) }))
    return say('Tell me what’s on today — “drinks after work”, “pack for Chicago” — and I’ll sort the clothes.')
  },
}
