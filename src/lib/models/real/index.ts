import type { Models } from '../types'
import { realChat } from './chat'
import { realRenderer } from './renderer'
import { realSegmenter } from './segmenter'
import { realStylist } from './stylist'
import { realTagger } from './tagger'
import { realTranscriber } from './transcriber'

/** Meta Model API adapters. */
export function realModels(): Models {
  return { segmenter: realSegmenter, tagger: realTagger, stylist: realStylist, renderer: realRenderer, transcriber: realTranscriber, chat: realChat }
}
