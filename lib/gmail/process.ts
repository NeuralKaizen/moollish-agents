import { assembleCorpus } from '@/lib/ingest/corpus'
import { INGEST_MAX_CHARS_PER_DOC, INGEST_TOTAL_BUDGET } from '@/lib/ingest/config'
import { messageToCorpusInputs } from './parse'
import type { GmailReader } from './types'

export interface ProcessDeps {
  reader: GmailReader
  alreadyProcessed: () => Promise<Set<string>>
  record: (row: { messageId: string; status: 'ok' | 'failed'; error?: string | null; opportunityId?: string | null }) => Promise<void>
  extractPdf: (bytes: Uint8Array) => Promise<string>
  analyzeAndSave: (corpusText: string) => Promise<string>
  max?: number
}

export interface ProcessSummary { processed: number; skipped: number; failed: number }

export async function processInbox(deps: ProcessDeps): Promise<ProcessSummary> {
  const ids = await deps.reader.listMessageIds({ max: deps.max ?? 25 })
  const seen = await deps.alreadyProcessed()
  const summary: ProcessSummary = { processed: 0, skipped: 0, failed: 0 }

  for (const id of ids) {
    if (seen.has(id)) { summary.skipped += 1; continue }
    try {
      const msg = await deps.reader.getMessage(id)
      const { inputs } = await messageToCorpusInputs(msg, deps.extractPdf)
      if (inputs.length === 0) {
        await deps.record({ messageId: id, status: 'ok', opportunityId: null })
        summary.processed += 1
        continue
      }
      const { text } = assembleCorpus(inputs, { maxCharsPerDoc: INGEST_MAX_CHARS_PER_DOC, totalBudget: INGEST_TOTAL_BUDGET })
      const opportunityId = await deps.analyzeAndSave(text)
      await deps.record({ messageId: id, status: 'ok', opportunityId })
      summary.processed += 1
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido'
      await deps.record({ messageId: id, status: 'failed', error: message })
      summary.failed += 1
    }
  }
  return summary
}
