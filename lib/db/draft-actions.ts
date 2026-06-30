'use server'

import { revalidatePath } from 'next/cache'
import { getOpportunity } from './queries'
import { recordDraft } from './drafts'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { generateDraft, generateDraftWithOpenRouter } from '@/lib/agent/drafts/generate'

export async function generateDraftAction(opportunityId: string, kind: string): Promise<void> {
  const o = await getOpportunity(opportunityId)
  if (!o) return

  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }

  const { content, missingData } = await generateDraft(kind, o.analysis, funderBlock, { generate: generateDraftWithOpenRouter })
  await recordDraft({ id: `${opportunityId}:${kind}`, opportunityId, kind, content, missingData })
  revalidatePath(`/oportunidad/${opportunityId}`)
}
