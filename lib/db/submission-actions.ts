'use server'

import { revalidatePath } from 'next/cache'
import { db } from './client'
import { submissions } from './schema'
import type { NewSubmissionRow } from './schema'

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
