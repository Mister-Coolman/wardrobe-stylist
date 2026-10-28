/** Mono 16-bit PCM WAV — the only format /v1/asr/transcribe accepts (16 or 24 kHz). */
export function pcm16Wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2)
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8, 'ascii')
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36, 'ascii'); b.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((s, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s < 0 ? s * 32768 : s * 32767))), 44 + i * 2))
  return b
}

export const silentWav = (seconds: number) => pcm16Wav(new Float32Array(Math.round(16000 * seconds)), 16000)
