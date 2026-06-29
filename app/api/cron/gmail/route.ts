import { processInbox } from '@/lib/gmail/process'
import { createGmailReader } from '@/lib/gmail/client'
import { listProcessedIds, recordProcessed } from '@/lib/db/processed-emails'
import { extractPdfText } from '@/lib/ingest/pdf'
import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { listFunders, rowToProfile } from '@/lib/db/funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { addOpportunityAction } from '@/lib/db/actions'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

async function analyzeAndSave(text: string): Promise<string> {
  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(text, rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }
  const analysis = await analyzeOpportunity(text, { generate: generateWithOpenRouter }, { funderBlock })
  await addOpportunityAction(analysis)
  return analysis.opportunity_id
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const summary = await processInbox({
      reader: createGmailReader(),
      alreadyProcessed: listProcessedIds,
      record: recordProcessed,
      extractPdf: extractPdfText,
      analyzeAndSave,
    })
    return Response.json(summary)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'error'
    return Response.json({ error: message }, { status: 500 })
  }
}
