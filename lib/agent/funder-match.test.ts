import { describe, it, expect } from 'vitest'
import { matchFunder, formatFunderBlock, type FunderProfile } from './funder-match'

const fao: FunderProfile = { name: 'FAO', aliases: ['FAO', 'Food and Agriculture Organization'], themes: 'seguridad alimentaria' }
const car: FunderProfile = { name: 'CAR', aliases: ['CAR'], themes: 'restauración, biodiversidad' }
const funders = [fao, car]

describe('matchFunder', () => {
  it('matchea por alias como palabra completa, case-insensitive', () => {
    expect(matchFunder('Convocatoria de la fao para...', funders)?.name).toBe('FAO')
    expect(matchFunder('Food and Agriculture Organization abre...', funders)?.name).toBe('FAO')
  })
  it('NO matchea un alias embebido dentro de otra palabra', () => {
    expect(matchFunder('instrucciones para descargar el pliego', funders)).toBeNull() // "car" en "descargar"
  })
  it('devuelve null si ningún alias aparece', () => {
    expect(matchFunder('convocatoria del BID', funders)).toBeNull()
  })
})

describe('formatFunderBlock', () => {
  it('arma un bloque con los campos no vacíos del perfil', () => {
    const block = formatFunderBlock(fao)
    expect(block).toContain('FAO')
    expect(block).toContain('seguridad alimentaria')
  })
  it('devuelve un bloque genérico cuando no hay financiador', () => {
    const block = formatFunderBlock(null)
    expect(block.toLowerCase()).toContain('no se identificó')
  })
})
