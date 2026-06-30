import { describe, it, expect, beforeEach, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
import { db } from './client'
import { allies } from './schema'
import { getAlly } from './allies'
import { createAllyAction, updateAllyAction, deleteAllyAction } from './ally-actions'

const hasDb = !!process.env.DATABASE_URL

describe.skipIf(!hasDb)('ally actions (integración)', () => {
  beforeEach(async () => { await db.delete(allies) })

  it('create/update/delete round-trip', async () => {
    await createAllyAction({ id: 'unal', name: 'UNAL', type: 'universidad', reputation: 'alto' })
    expect((await getAlly('unal'))?.name).toBe('UNAL')
    await updateAllyAction('unal', { capabilities: 'investigación' })
    expect((await getAlly('unal'))?.capabilities).toBe('investigación')
    await deleteAllyAction('unal')
    expect(await getAlly('unal')).toBeUndefined()
  })
})
