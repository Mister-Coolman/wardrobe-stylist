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
        const owned = text.match(/i (?:have|own) (two|three|\d+)/)
        // "I have two of X": one already in the closet, so add the rest
        if (owned) return calls(tool('duplicate_piece', { id: first, count: Math.max(1, ({ two: 2, three: 3 }[owned[1]] ?? Number(owned[1])) - 1) }))
      }
      return say(result.summary ?? (result.error ? `That didn’t work: ${result.error}.` : 'Done.'))
    }

    const date = (text.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0]
    const dated = date ? { date } : {}
    const outfit = outfitInView(messages.slice(0, -1), userMsg?.quoted)

    if (/(instagram\.com|tiktok\.com)\//.test(text)) return say('Send me a screenshot of the moment you liked.')
    if (userMsg?.imageUrl) {
      if (/recreate|match|like this|this look/.test(text)) return calls(tool('recreate_look', { ...dated, ...(raw.match(/@\w+/) ? { wish: `from ${raw.match(/@\w+/)![0]}’s look` } : {}) }))
      if (/rate|how do i look/.test(text)) return calls(tool('rate_outfit', dated))
      if (/add/.test(text)) return calls(tool('add_photo_piece'))
    }
    if (/^(yes|add them|add it|keep them)/.test(text) && !/^yes,? delete/.test(text)) {
      const found = [...messages].reverse().map((m) => (m.role === 'assistant' ? m.content ?? '' : '')).map((t) => t.match(/\[found in the photo[^:]*: ([^\]]+)\]/)).find(Boolean)
      const ids = found ? [...found[1].matchAll(/\(([^)]+)\)/g)].map((m) => m[1]) : []
      if (ids.length) return calls(tool('keep_pieces', { ids }))
    }
    if (/pack|trip/.test(text)) {
      const city = (raw.match(/(?:to|for)\s+([A-Z][\w ]+?)(?:\s+(?:for|from|on)\b|[.,?!]|$)/) ?? [])[1] ?? 'Chicago'
      return calls(tool('plan_trip', { destination: city.trim(), days: 3 }))
    }
    if (/^another (look|one)/.test(text)) return calls(tool('another_look', dated))
    if (/^(i )?wore it/.test(text)) return outfit ? calls(tool('log_wear', { outfitId: outfit.outfitId })) : say('Which look?')
    if (/make it today|today.s look|wear (?:it|this|that)(?: one)? today/.test(text)) return outfit ? calls(tool('set_today', { outfitId: outfit.outfitId })) : say('Which look?')
    const view = text.match(/mannequin|flat ?lay|try (?:it )?on|on me/)
    if (view && outfit) {
      const mode = view[0] === 'mannequin' ? 'mannequin' : /flat/.test(view[0]) ? 'flatlay' : 'tryon'
      return calls(tool('render_look', { outfitId: outfit.outfitId, mode, ...(/always|from now on|by default/.test(text) ? { always: true } : {}) }))
    }
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
    const owned = text.match(/^i (?:have|own) (?:two|three|\d+) (?:of )?(?:the |my |these )?(.+?)[.!?]?$/)
    if (owned) return calls(tool('search_wardrobe', { query: owned[1] }))
    const del = text.match(/^(?:delete|remove|get rid of) (?:the |my )?(.+?)[.!?]?$/)
    if (del) return say(`Delete the ${del[1]} for good? Say “yes, delete”.`)
    if (/^yes,? delete/.test(text)) {
      const asked = [...users].reverse().slice(1).map((m) => m.content.toLowerCase().match(/^(?:delete|remove|get rid of) (?:the |my )?(.+?)[.!?]?$/)).find(Boolean)
      return asked ? calls(tool('search_wardrobe', { query: asked[1] })) : say('Delete what?')
    }
    if (/^(i like|remember|in general|i always|i never|never suggest)/.test(text)) return calls(tool('remember', { text: raw.replace(/^remember( that)?\s*/i, '') }))
    const forget = text.match(/^forget (?:the |that )?(.+?)(?: thing)?[.!?]?$/)
    if (forget) {
      const system = messages[0]?.role === 'system' ? messages[0].content : ''
      const note = [...system.matchAll(/^- \((\S+)\) (.+)$/gm)].find((m) => m[2].toLowerCase().includes(forget[1]))
      return note ? calls(tool('forget', { id: note[1] })) : say('I don’t have a note like that.')
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
