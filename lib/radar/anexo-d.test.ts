import { describe, it, expect } from 'vitest'
import { passesPrefilter, matchedKeywords } from './anexo-d'

describe('anexo-d prefilter', () => {
  it('incluye textos con keywords del Anexo D', () => {
    expect(passesPrefilter('Servicio de monitoreo agrícola y riego rural')).toBe(true)
    expect(passesPrefilter('Mejoramiento de ganadería sostenible')).toBe(true)
  })
  it('excluye textos sin keywords relevantes', () => {
    expect(passesPrefilter('Pavimentación de vía urbana y andenes')).toBe(false)
    expect(passesPrefilter('Compra de mobiliario de oficina')).toBe(false)
  })
  it('excluye aunque tenga keyword si hay término excluido dominante', () => {
    expect(passesPrefilter('Construcción de obra civil de acueducto')).toBe(false)
  })
  it('matchedKeywords devuelve las keywords presentes', () => {
    expect(matchedKeywords('riego y agricultura de precisión')).toEqual(expect.arrayContaining(['agricultura']))
  })
})
