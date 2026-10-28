import { mockSegmenter } from '../mock/others'
import type { Models } from '../types'
import { realChat } from './chat'
import { realRenderer } from './renderer'
import { realStylist } from './stylist'
import { realTagger } from './tagger'
import { realTranscriber } from './transcriber'

/** Meta Model API adapters. The segmenter stays on the mock until the SAM 3.1 parser lands. */
export function realModels(): Models {
  return { segmenter: mockSegmenter, tagger: realTagger, stylist: realStylist, renderer: realRenderer, transcriber: realTranscriber, chat: realChat }
}
