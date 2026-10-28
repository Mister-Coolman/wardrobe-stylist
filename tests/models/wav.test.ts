import { expect, test } from 'vitest'
import { pcm16Wav, silentWav } from '@/lib/models/real/wav'

test('pcm16Wav writes a mono 16-bit RIFF header at the given rate', () => {
  const wav = pcm16Wav(new Float32Array([0, 1, -1]), 16000)
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
  expect(wav.readUInt16LE(22)).toBe(1)        // channels
  expect(wav.readUInt32LE(24)).toBe(16000)    // sample rate
  expect(wav.readUInt16LE(34)).toBe(16)       // bits per sample
  expect(wav.readUInt32LE(40)).toBe(6)        // data bytes
  expect(wav.readInt16LE(46)).toBe(32767)
  expect(wav.readInt16LE(48)).toBe(-32768)
})

test('silentWav is the right length', () => expect(silentWav(0.5).length).toBe(44 + 16000))
