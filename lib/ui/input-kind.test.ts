import { describe, it, expect } from 'vitest'
import { looksLikeUrl, decideInput } from './input-kind'

describe('looksLikeUrl', () => {
  it('reconoce http/https sin espacios', () => {
    expect(looksLikeUrl('https://fontagro.org/conv')).toBe(true)
    expect(looksLikeUrl('http://x.org')).toBe(true)
  })
  it('rechaza texto y URLs con espacios', () => {
    expect(looksLikeUrl('convocatoria FAO 2026')).toBe(false)
    expect(looksLikeUrl('https://x.org con texto')).toBe(false)
    expect(looksLikeUrl('')).toBe(false)
  })
})

describe('decideInput', () => {
  const fakeFile = { name: 'a.pdf' } as File
  it('un archivo manda sobre el texto', () => {
    expect(decideInput('lo que sea', fakeFile)).toEqual({ kind: 'pdf', file: fakeFile })
  })
  it('una URL pegada se trata como url', () => {
    expect(decideInput('https://x.org/conv', null)).toEqual({ kind: 'url', url: 'https://x.org/conv' })
  })
  it('texto largo se trata como text', () => {
    expect(decideInput('Convocatoria con bases...', null)).toEqual({ kind: 'text', text: 'Convocatoria con bases...' })
  })
  it('vacío sin archivo devuelve null', () => {
    expect(decideInput('   ', null)).toBeNull()
  })
})

describe('decideInput (imagen)', () => {
  it('un archivo image/* es kind image', () => {
    const file = new File([new Uint8Array([1])], 'cap.png', { type: 'image/png' })
    expect(decideInput('', file)).toEqual({ kind: 'image', file })
  })
  it('un archivo no-imagen sigue siendo pdf', () => {
    const file = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' })
    expect(decideInput('', file)).toEqual({ kind: 'pdf', file })
  })
})
