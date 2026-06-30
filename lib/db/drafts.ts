import { and, eq } from 'drizzle-orm'
import { db } from './client'
import { drafts, type DraftRow, type NewDraftRow } from './schema'

export async function recordDraft(row: NewDraftRow): Promise<void> {
  await db.insert(drafts).values(row)
    .onConflictDoUpdate({
      target: drafts.id,
      set: { content: row.content, missingData: row.missingData, createdAt: new Date() },
    })
}

export async function getDraft(opportunityId: string, kind: string): Promise<DraftRow | undefined> {
  const rows = await db.select().from(drafts)
    .where(and(eq(drafts.opportunityId, opportunityId), eq(drafts.kind, kind)))
    .limit(1)
  return rows[0]
}
