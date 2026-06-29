// lib/radar/discover.test.ts
import { describe, it, expect } from 'vitest'
import { discoverFromSecop } from './discover'
import type { NewDetectedRow } from '@/lib/db/schema'

const good = { id_del_proceso: 'A', descripci_n_del_procedimiento: 'Riego agrícola rural', entidad: 'ADR' }
const offtopic = { id_del_proceso: 'B', descripci_n_del_procedimiento: 'Pavimentación de vías', entidad: 'Alcaldía' }
const malformed = { entidad: 'sin id ni titulo' }

it('inserta las que pasan el pre-filtro, saltea off-topic, malformadas y duplicadas', async () => {
  const recorded: NewDetectedRow[] = []
  const summary = await discoverFromSecop({
    fetchRows: async () => [good, offtopic, malformed, good],
    recordDetected: async (r) => { recorded.push(r) },
    queries: ['agro'],
  })
  expect(recorded).toHaveLength(1)
  expect(recorded[0].id).toBe('secop:A')
  expect(recorded[0].status).toBe('detectada')
  expect(recorded[0].themes).toContain('agrícola')
  expect(summary.inserted).toBe(1)
  expect(summary.skipped).toBeGreaterThanOrEqual(1)
})

it('una query que falla no frena el resto', async () => {
  let call = 0
  const recorded: NewDetectedRow[] = []
  await discoverFromSecop({
    fetchRows: async () => { call++; if (call === 1) throw new Error('boom'); return [good] },
    recordDetected: async (r) => { recorded.push(r) },
    queries: ['x', 'y'],
  })
  expect(recorded).toHaveLength(1)
})
