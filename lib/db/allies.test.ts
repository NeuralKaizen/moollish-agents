import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { allies } from './schema'
import { listAllies, getAlly, rowToProfile } from './allies'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('allies queries (integración)', () => {
  beforeEach(async () => { await db.delete(allies) })

  it('listAllies devuelve ordenado por name', async () => {
    await db.insert(allies).values([
      { id: 'b', name: 'Beta', type: 'universidad', reputation: 'alto' },
      { id: 'a', name: 'Alfa', type: 'ONG', reputation: 'medio' },
    ])
    const rows = await listAllies()
    expect(rows.map((r) => r.name)).toEqual(['Alfa', 'Beta'])
  })

  it('getAlly devuelve uno o undefined', async () => {
    await db.insert(allies).values({ id: 'a', name: 'Alfa', type: 'ONG', reputation: 'medio' })
    expect((await getAlly('a'))?.name).toBe('Alfa')
    expect(await getAlly('nope')).toBeUndefined()
  })

  it('rowToProfile proyecta el subset esperado', async () => {
    await db.insert(allies).values({
      id: 'a', name: 'Alfa', type: 'ONG', country: 'Colombia',
      capabilities: 'territorio', recommendedRole: 'Implementador', reputation: 'medio',
    })
    const row = await getAlly('a')
    expect(rowToProfile(row!)).toEqual({
      name: 'Alfa', type: 'ONG', country: 'Colombia',
      capabilities: 'territorio', recommendedRole: 'Implementador', reputation: 'medio',
    })
  })
})
