import { mockChat, mockRenderer, mockSegmenter, mockTagger, mockTranscriber } from './mock/others'
import { mockStylist } from './mock/stylist'
import { realModels } from './real'
import type { Models } from './types'

export * from './types'

const mock: Models = {
  segmenter: mockSegmenter, tagger: mockTagger, stylist: mockStylist,
  renderer: mockRenderer, transcriber: mockTranscriber, chat: mockChat,
}

let real: Models | null = null

/** MODELS=mock|real; default mock. */
export function getModels(): Models {
  if ((process.env.MODELS || 'mock') !== 'real') return mock
  real ??= realModels()
  return real
}
