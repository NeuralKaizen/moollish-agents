// lib/gmail/process.test.ts
import { describe, it, expect } from 'vitest'
import { processInbox } from './process'
import type { GmailReader, GmailMessage } from './types'

const extractPdf = async () => ''

function readerOf(msgs: Record<string, GmailMessage>): GmailReader {
  return {
    async listMessageIds() { return Object.keys(msgs) },
    async getMessage(id) { return msgs[id] },
  }
}
const baseMsg = (id: string, over: Partial<GmailMessage> = {}): GmailMessage =>
  ({ id, from: 'x@y.org', subject: `S${id}`, body: `cuerpo ${id}`, attachments: [], ...over })

it('procesa nuevos, saltea ya-procesados y registra opportunity_id', async () => {
  const recorded: any[] = []
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a'), b: baseMsg('b') }),
    alreadyProcessed: async () => new Set(['b']),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => 'op-1',
  })
  expect(summary).toEqual({ processed: 1, skipped: 1, failed: 0 })
  expect(recorded).toEqual([{ messageId: 'a', status: 'ok', opportunityId: 'op-1' }])
})

it('un correo que falla se registra failed sin frenar el lote', async () => {
  const recorded: any[] = []
  let calls = 0
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a'), b: baseMsg('b') }),
    alreadyProcessed: async () => new Set(),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => { calls++; if (calls === 1) throw new Error('boom'); return 'op-2' },
  })
  expect(summary.processed).toBe(1)
  expect(summary.failed).toBe(1)
  expect(recorded.find((r) => r.status === 'failed')?.error).toBe('boom')
})

it('correo sin contenido se registra ok sin oportunidad y no llama analyzeAndSave', async () => {
  const recorded: any[] = []
  let analyzed = 0
  const summary = await processInbox({
    reader: readerOf({ a: baseMsg('a', { body: '   ' }) }),
    alreadyProcessed: async () => new Set(),
    record: async (r) => { recorded.push(r) },
    extractPdf,
    analyzeAndSave: async () => { analyzed++; return 'op' },
  })
  expect(analyzed).toBe(0)
  expect(summary.processed).toBe(1)
  expect(recorded[0]).toEqual({ messageId: 'a', status: 'ok', opportunityId: null })
})
