import type { CalendarEvent, Candidate, Garment, Level, StyleProfile } from '@/lib/domain/types'
import type { DayContext, TripUsage, Violation } from '@/lib/rules/types'

export class ModelError extends Error {
  constructor(public adapter: string, public kind: 'timeout' | 'bad_output' | 'http' | 'unavailable', msg: string) {
    super(`${adapter}: ${msg}`)
    this.name = 'ModelError'
  }
}

export const TIMEOUT_MS = 30_000
export const RENDER_TIMEOUT_MS = 45_000

export function withTimeout<T>(p: Promise<T>, ms: number, adapter: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const t = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ModelError(adapter, 'timeout', `no response in ${ms} ms`)), ms) })
  return Promise.race([p, t]).finally(() => clearTimeout(timer))
}

export interface FrameMask { frameIndex: number; maskPng: Buffer; area: number; bbox: [number, number, number, number] }
export interface SegmentTrack { trackId: string; masks: FrameMask[] }
export interface Segmenter {
  segment(frameUrls: string[]): Promise<SegmentTrack[]>
  /** Full-frame masks of hangers in one frame, to cut out of a garment's mask. */
  hangers?(frameUrl: string): Promise<Buffer[]>
}

export type GarmentTags = Pick<Garment, 'name' | 'category' | 'subcategory' | 'colors' | 'pattern' | 'formality' | 'warmth' | 'rainSafe' | 'tags' | 'brand' | 'fit'>
/** What a store listing's title says about a piece; colors: the colours the title names, often none */
export type ListingDetails = Pick<GarmentTags, 'name' | 'category' | 'brand' | 'fit' | 'tags' | 'colors'>
export interface Tagger {
  tag(cutoutUrl: string): Promise<GarmentTags>
  sameItem(a: string, b: string): Promise<boolean>
  /** currentName: the owner's name for the piece, whose colour is kept when the title gives none */
  fromListing(title: string, currentName?: string): Promise<ListingDetails>
}

export interface ProposeInput {
  day: DayContext; wardrobe: Garment[]; count: number; extraGuidance?: string; styleProfile?: StyleProfile | null
  /** garment-id sets already shown today ("Another look") */
  avoidOutfits?: string[][]
  /** on a trip: how often each piece has been worn so far */
  trip?: TripUsage
  /** a swap: pieces to keep and to leave out */
  keep?: string[]; drop?: string[]
  /** what the owner asked for ("fall themed", "smarter"); a photo of a look to match */
  wish?: string; referenceImageUrl?: string
  /** the owner's standing preferences ("navy with olive", "I run warm") */
  notes?: string[]
}
export interface Stylist {
  classifyEvents(events: CalendarEvent[]): Promise<Record<string, Level>>
  propose(input: ProposeInput): Promise<Candidate[]>
  revise(input: ProposeInput & { rejected: { candidate: Candidate; violations: Violation[] }[] }): Promise<Candidate[]>
  suggestGaps(wardrobe: Garment[]): Promise<GarmentTags[]>
  styleFromImages?(imageUrls: string[]): Promise<StyleProfile>
  /** A real place to buy the item (Muse Spark + web search when real). */
  searchProduct?(item: GarmentTags): Promise<{ title: string; url: string; price?: string } | null>
}

/** What the renderer is told about each piece, beside its cutout */
export type RenderPiece = Pick<Garment, 'cutoutUrl' | 'name' | 'category' | 'subcategory' | 'colors' | 'tags' | 'brand' | 'fit'>
const RENDER_ORDER = ['outerwear', 'top', 'onepiece', 'bottom', 'shoes', 'accessory']
/** Outerwear, tops, bottoms, shoes: the order pieces go to the renderer and sit in a flat lay */
export const renderOrder = <P extends Pick<Garment, 'category'>>(pieces: P[]) => [...pieces].sort((a, b) => RENDER_ORDER.indexOf(a.category) - RENDER_ORDER.indexOf(b.category))
export interface Renderer { render(req: { mode: 'tryon' | 'flatlay'; pieces: RenderPiece[]; personPhotoUrl?: string }): Promise<{ url: string }> }
export interface Transcriber { transcribe(audio: Buffer, mime: string): Promise<string> }

// OpenAI chat-completions shapes
export interface ToolCall { id: string; name: string; arguments: string }
export type ChatMessage =
  | { role: 'system'; content: string }
  /** imageUrl: a photo the model should see (only the newest one is sent); quoted: the message this one replies to, spelled out */
  | { role: 'user'; content: string; imageUrl?: string; quoted?: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string }
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
export interface ChatTurn { content: string | null; toolCalls: ToolCall[] }
export interface ChatModel { complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatTurn> }

export interface Models { segmenter: Segmenter; tagger: Tagger; stylist: Stylist; renderer: Renderer; transcriber: Transcriber; chat: ChatModel }
