'use server'

import { revalidatePath } from 'next/cache'
import { getOpportunity } from './queries'
import { recordDraft } from './drafts'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { generateConceptNote, generateConceptNoteWithOpenRouter } from '@/lib/agent/drafts/concept-note'

export async function generateConceptNoteAction(opportunityId: string): Promise<void> {
  const o = await getOpportunity(opportunityId)
  if (!o) return

  let funderBlock = formatFunderBlock(null)
  try {
    const rows = await listFunders()
    funderBlock = formatFunderBlock(matchFunder(JSON.stringify(o.analysis), rows.map(rowToProfile)))
  } catch {
    // sin financiadores → bloque genérico
  }

  const note = await generateConceptNote(o.analysis, funderBlock, { generate: generateConceptNoteWithOpenRouter })
  await recordDraft({
    id: `${opportunityId}:concept_note`,
    opportunityId,
    kind: 'concept_note',
    content: note,
    missingData: note.missing_data,
  })
  revalidatePath(`/oportunidad/${opportunityId}`)
}
