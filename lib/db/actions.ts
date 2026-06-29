'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { opportunities } from './schema'
import { opportunityToRow } from './mappers'
import { makeOpportunity } from '@/lib/demo/operations'
import { SEED_OPPORTUNITIES } from '@/lib/demo/seed'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { PipelineState } from '@/lib/demo/types'

function revalidateAll(): void {
  revalidatePath('/')
  revalidatePath('/pipeline')
  revalidatePath('/dashboard')
}

export async function addOpportunityAction(analysis: OpportunityAnalysis): Promise<void> {
  const row = opportunityToRow(makeOpportunity(analysis, new Date().toISOString()))
  await db.insert(opportunities).values(row)
    .onConflictDoUpdate({ target: opportunities.id, set: row })
  revalidateAll()
}

export async function setOpportunityStateAction(
  id: string, state: PipelineState, reason?: string,
): Promise<void> {
  await db.update(opportunities)
    .set(reason !== undefined ? { state, decisionReason: reason } : { state })
    .where(eq(opportunities.id, id))
  revalidateAll()
}

export async function toggleOpportunityTaskAction(id: string, index: number): Promise<void> {
  const rows = await db.select({ tasks: opportunities.tasks })
    .from(opportunities).where(eq(opportunities.id, id)).limit(1)
  const tasks = rows[0]?.tasks
  if (!tasks || !tasks[index]) return
  const next = tasks.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
  await db.update(opportunities).set({ tasks: next }).where(eq(opportunities.id, id))
  revalidateAll()
}

export async function resetDemoAction(): Promise<void> {
  await db.delete(opportunities)
  const rows = SEED_OPPORTUNITIES.map(opportunityToRow)
  if (rows.length > 0) await db.insert(opportunities).values(rows)
  revalidateAll()
}
