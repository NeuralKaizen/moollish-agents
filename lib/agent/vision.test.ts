// lib/agent/vision.test.ts
import { describe, it, expect } from 'vitest'
import { toImageDataUrl, VisionExtractSchema } from './vision'

describe('vision (puro)', () => {
  it('toImageDataUrl arma un data URL base64 con el mime', () => {
    const bytes = new Uint8Array([0x68, 0x69]) // "hi"
    expect(toImageDataUrl(bytes, 'image/png')).toBe('data:image/png;base64,aGk=')
  })

  it('VisionExtractSchema acepta detected_url/source_guess nulos', () => {
    const parsed = VisionExtractSchema.parse({ text: 'hola', detected_url: null, source_guess: null })
    expect(parsed.text).toBe('hola')
  })
})
