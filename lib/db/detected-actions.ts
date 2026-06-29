'use server'

import { revalidatePath } from 'next/cache'
import { getDetected, markDetected } from './detected'
import { promoteDetected } from '@/lib/radar/promote'
import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'
import { listFunders, rowToProfile } from './funders'
import { matchFunder, formatFunderBlock } from '@/lib/agent/funder-match'
import { addOpportunityAction } from './actions'

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

export async function promoteDetectedAction(id: string): Promise<void> {
  await promoteDetected(id, {
    getDetected,
    analyzeAndSave,
    markPromoted: (detectedId, opportunityId) => markDetected(detectedId, 'promovida', opportunityId),
  })
  revalidatePath('/radar')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
}

export async function discardDetectedAction(id: string): Promise<void> {
  await markDetected(id, 'descartada')
  revalidatePath('/radar')
}
