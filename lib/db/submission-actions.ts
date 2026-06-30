'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { submissions, opportunities } from './schema'
import type { NewSubmissionRow } from './schema'
import { getOpportunity } from './queries'
import { getSubmission } from './submissions'
import { listFunders, rowToProfile } from './funders'
import { updateFunderAction } from './funder-actions'
import { matchFunder } from '@/lib/agent/funder-match'
import { stateForResultado, appendLesson, type Resultado } from '@/lib/agent/tracking/lessons'

export async function saveSubmissionAction(
  opportunityId: string,
  patch: Partial<Omit<NewSubmissionRow, 'id'>>,
): Promise<void> {
  await db.insert(submissions).values({ id: opportunityId, ...patch })
    .onConflictDoUpdate({ target: submissions.id, set: { ...patch, updatedAt: new Date() } })
  revalidatePath('/seguimiento')
  revalidatePath('/dashboard')
  revalidatePath(`/oportunidad/${opportunityId}`)
}

export async function recordOutcomeAction(
  opportunityId: string,
  outcome: { resultado: Resultado | null; montoOtorgado: string | null; leccion: string | null },
): Promise<void> {
  const patch = { resultado: outcome.resultado, montoOtorgado: outcome.montoOtorgado, leccion: outcome.leccion, leccionAnexada: false }
  await db.insert(submissions).values({ id: opportunityId, ...patch })
    .onConflictDoUpdate({ target: submissions.id, set: { ...patch, updatedAt: new Date() } })
  if (outcome.resultado) {
    const state = stateForResultado(outcome.resultado)
    if (state) await db.update(opportunities).set({ state }).where(eq(opportunities.id, opportunityId))
  }
  revalidatePath('/seguimiento')
  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  revalidatePath(`/oportunidad/${opportunityId}`)
}

export async function saveLessonToFunderAction(
  opportunityId: string,
): Promise<{ status: 'anexada' | 'sin_financiador' | 'sin_leccion' }> {
  const o = await getOpportunity(opportunityId)
  const sub = await getSubmission(opportunityId)
  const leccion = sub?.leccion?.trim()
  if (!o || !leccion) return { status: 'sin_leccion' }

  const rows = await listFunders()
  const profiles = rows.map(rowToProfile)
  const matched = matchFunder(JSON.stringify(o.analysis), profiles)
  if (!matched) return { status: 'sin_financiador' }
  const row = rows[profiles.indexOf(matched)]
  if (!row) return { status: 'sin_financiador' }

  await updateFunderAction(row.id, { lessonsLearned: appendLesson(row.lessonsLearned, leccion, new Date()) })
  await db.update(submissions).set({ leccionAnexada: true }).where(eq(submissions.id, opportunityId))
  revalidatePath(`/oportunidad/${opportunityId}`)
  return { status: 'anexada' }
}
