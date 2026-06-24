import { describe, it, expect } from 'vitest'
import { createStore, DEMO_STORAGE_KEY, type KeyValueStorage } from './store'
import { makeOpportunity } from './operations'
import { SAMPLE_ANALYSIS } from '@/lib/ui/sample-analysis'

function memStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v },
    removeItem: (k) => { delete data[k] },
  }
}

const seed = [makeOpportunity(SAMPLE_ANALYSIS, '2026-06-20T00:00:00.000Z')]

describe('createStore', () => {
  it('siembra y persiste si el storage está vacío', () => {
    const storage = memStorage()
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(1)
    expect(storage.data[DEMO_STORAGE_KEY]).toContain(SAMPLE_ANALYSIS.opportunity_id)
  })

  it('rehidrata desde storage existente', () => {
    const storage = memStorage({ [DEMO_STORAGE_KEY]: JSON.stringify([]) })
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(0)
  })

  it('cae a la semilla si el JSON está corrupto', () => {
    const storage = memStorage({ [DEMO_STORAGE_KEY]: '{no-json' })
    const store = createStore(seed, storage)
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('add notifica a los suscriptores y persiste', () => {
    const storage = memStorage()
    const store = createStore([], storage)
    let calls = 0
    store.subscribe(() => { calls += 1 })
    store.add(SAMPLE_ANALYSIS)
    expect(store.getSnapshot()).toHaveLength(1)
    expect(calls).toBe(1)
    expect(storage.data[DEMO_STORAGE_KEY]).toContain(SAMPLE_ANALYSIS.opportunity_id)
  })

  it('reset vuelve a la semilla', () => {
    const store = createStore(seed, memStorage())
    store.add({ ...SAMPLE_ANALYSIS, opportunity_id: 'otra' })
    expect(store.getSnapshot()).toHaveLength(2)
    store.reset()
    expect(store.getSnapshot()).toHaveLength(1)
  })

  it('funciona sin storage (null)', () => {
    const store = createStore(seed, null)
    expect(store.getSnapshot()).toHaveLength(1)
    store.add({ ...SAMPLE_ANALYSIS, opportunity_id: 'x' })
    expect(store.getSnapshot()).toHaveLength(2)
  })
})
