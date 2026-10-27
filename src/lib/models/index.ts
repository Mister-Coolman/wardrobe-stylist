import { mockChat, mockRenderer, mockSegmenter, mockTagger, mockTranscriber } from './mock/others'
import { mockStylist } from './mock/stylist'
import type { Models } from './types'

export * from './types'

const mock: Models = {
  segmenter: mockSegmenter, tagger: mockTagger, stylist: mockStylist,
  renderer: mockRenderer, transcriber: mockTranscriber, chat: mockChat,
}

/** MODELS=mock|real; default mock. Real adapters land in Task 18. */
export function getModels(): Models {
  const mode = process.env.MODELS || 'mock'
  if (mode === 'real') throw new Error('MODELS=real needs the Meta adapters (plan Task 18); use MODELS=mock until then')
  return mock
}
