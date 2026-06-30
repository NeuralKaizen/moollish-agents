import { describe, it, expect } from 'vitest'
import { ALLY_SEED } from './allies-seed'

describe('ALLY_SEED', () => {
  it('tiene ~6 aliados con id único', () => {
    expect(ALLY_SEED.length).toBeGreaterThanOrEqual(6)
    expect(new Set(ALLY_SEED.map((a) => a.id)).size).toBe(ALLY_SEED.length)
  })

  it('name/type no vacíos y reputation válida', () => {
    for (const a of ALLY_SEED) {
      expect(a.name.trim().length).toBeGreaterThan(0)
      expect(a.type.trim().length).toBeGreaterThan(0)
      expect(['alto', 'medio', 'bajo']).toContain(a.reputation)
    }
  })
})
