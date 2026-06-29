import { describe, it, expect } from 'vitest'
import { FUNDER_SEED } from './funders-seed'

describe('FUNDER_SEED', () => {
  it('trae 7 financiadores con id único, name y aliases no vacíos', () => {
    expect(FUNDER_SEED).toHaveLength(7)
    const ids = FUNDER_SEED.map((f) => f.id)
    expect(new Set(ids).size).toBe(7)
    for (const f of FUNDER_SEED) {
      expect(f.name.length).toBeGreaterThan(0)
      expect(Array.isArray(f.aliases) && f.aliases.length).toBeTruthy()
    }
  })
})
