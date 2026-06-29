import { db } from './client'
import { processedEmails, type NewProcessedEmailRow } from './schema'

export async function listProcessedIds(): Promise<Set<string>> {
  const rows = await db.select({ id: processedEmails.messageId }).from(processedEmails)
  return new Set(rows.map((r) => r.id))
}

export async function recordProcessed(row: NewProcessedEmailRow): Promise<void> {
  await db.insert(processedEmails).values(row)
    .onConflictDoNothing({ target: processedEmails.messageId })
}
