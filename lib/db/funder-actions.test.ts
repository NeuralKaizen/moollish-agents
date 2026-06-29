// lib/db/funder-actions.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { funders } from './schema'
import { getFunder } from './funders'
import { createFunderAction, updateFunderAction, deleteFunderAction } from './funder-actions'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('funder actions (integración)', () => {
  beforeEach(async () => { await db.delete(funders) })

  it('create/update/delete round-trip', async () => {
    await createFunderAction({ id: 'fao', name: 'FAO', aliases: ['FAO'] })
    expect((await getFunder('fao'))?.name).toBe('FAO')
    await updateFunderAction('fao', { themes: 'seguridad alimentaria' })
    expect((await getFunder('fao'))?.themes).toBe('seguridad alimentaria')
    await deleteFunderAction('fao')
    expect(await getFunder('fao')).toBeUndefined()
  })
})
