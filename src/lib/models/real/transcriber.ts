// muse-voice-transcribe-1.0 via POST /v1/asr/transcribe (multipart: `request` JSON + `audio` WAV, mono 16-bit, 16/24 kHz).
import { ModelError } from '../types'
import type { Transcriber } from '../types'
import { metaFetch } from './client'

export const realTranscriber: Transcriber = {
  async transcribe(audio, mime) {
    if (!/wav/.test(mime)) throw new ModelError('transcriber', 'bad_output', `expected WAV, got ${mime}`)
    const form = new FormData()
    form.append('request', new Blob([JSON.stringify({ model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' }))
    form.append('audio', new Blob([new Uint8Array(audio)], { type: 'audio/wav' }), 'voice.wav')
    const res = await metaFetch('transcriber', '/asr/transcribe', { method: 'POST', headers: { Accept: 'application/json' }, body: form })
    const j = (await res.json()) as { transcript?: string }
    return (j.transcript ?? '').trim()
  },
}
