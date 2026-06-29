import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { detectedOpportunities, type DetectedRow, type NewDetectedRow } from './schema'

export async function recordDetected(row: NewDetectedRow): Promise<void> {
  await db.insert(detectedOpportunities).values(row)
    .onConflictDoNothing({ target: detectedOpportunities.id })
}

export async function listDetected(): Promise<DetectedRow[]> {
  return db.select().from(detectedOpportunities).orderBy(desc(detectedOpportunities.detectedAt))
}

export async function getDetected(id: string): Promise<DetectedRow | undefined> {
  const rows = await db.select().from(detectedOpportunities).where(eq(detectedOpportunities.id, id)).limit(1)
  return rows[0]
}

export async function markDetected(
  id: string, status: 'detectada' | 'promovida' | 'descartada', opportunityId?: string,
): Promise<void> {
  await db.update(detectedOpportunities)
    .set(opportunityId !== undefined ? { status, opportunityId } : { status })
    .where(eq(detectedOpportunities.id, id))
}
