import { eq } from 'drizzle-orm'
import { db } from './client'
import { submissions, type SubmissionRow } from './schema'

export async function listSubmissions(): Promise<SubmissionRow[]> {
  return db.select().from(submissions)
}

export async function getSubmission(opportunityId: string): Promise<SubmissionRow | undefined> {
  const rows = await db.select().from(submissions).where(eq(submissions.id, opportunityId)).limit(1)
  return rows[0]
}
