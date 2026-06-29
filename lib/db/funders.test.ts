import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './client'
import { funders } from './schema'
import { listFunders, getFunder, rowToProfile } from './funders'

const hasDb = !!process.env.DATABASE_URL
const row = { id: 'fao', name: 'FAO', aliases: ['FAO', 'Food and Agriculture Organization'], themes: 'seguridad alimentaria' }

describe.skipIf(!hasDb)('funders queries (integración)', () => {
  beforeEach(async () => { await db.delete(funders) })

  it('listFunders ordena por name y getFunder trae por id', async () => {
    await db.insert(funders).values([row, { id: 'bid', name: 'BID', aliases: ['BID'] }])
    const list = await listFunders()
    expect(list.map((f) => f.name)).toEqual(['BID', 'FAO'])
    expect((await getFunder('fao'))?.name).toBe('FAO')
    expect(await getFunder('nope')).toBeUndefined()
  })

  it('rowToProfile mapea fila a FunderProfile', async () => {
    await db.insert(funders).values(row)
    const r = await getFunder('fao')
    const profile = rowToProfile(r!)
    expect(profile.name).toBe('FAO')
    expect(profile.aliases).toContain('FAO')
    expect(profile.themes).toBe('seguridad alimentaria')
  })
})
