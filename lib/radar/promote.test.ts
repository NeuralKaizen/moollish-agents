// lib/radar/promote.test.ts
import { describe, it, expect } from 'vitest'
import { promoteDetected, detectedToCorpus } from './promote'
import type { DetectedRow } from '@/lib/db/schema'

const d: DetectedRow = {
  id: 'secop:A', source: 'secop', sourceRef: 'A', title: 'Riego agrícola', funder: 'ADR',
  amount: '1000', currency: 'COP', deadline: '2026-09-30', url: 'https://x', themes: 'agrícola',
  status: 'detectada', opportunityId: null, detectedAt: new Date(),
}

it('detectedToCorpus incluye título, entidad y monto', () => {
  const text = detectedToCorpus(d)
  expect(text).toContain('Riego agrícola')
  expect(text).toContain('ADR')
  expect(text).toContain('1000')
})

it('promoteDetected analiza, guarda y marca promovida', async () => {
  let markedWith: { id: string; op: string } | null = null
  const res = await promoteDetected('secop:A', {
    getDetected: async () => d,
    analyzeAndSave: async () => 'op-7',
    markPromoted: async (id, op) => { markedWith = { id, op } },
  })
  expect(res).toBe('promoted')
  expect(markedWith).toEqual({ id: 'secop:A', op: 'op-7' })
})

it('promoteDetected devuelve not_found y no marca si no existe', async () => {
  let marked = false
  const res = await promoteDetected('nope', {
    getDetected: async () => undefined,
    analyzeAndSave: async () => 'x',
    markPromoted: async () => { marked = true },
  })
  expect(res).toBe('not_found')
  expect(marked).toBe(false)
})
