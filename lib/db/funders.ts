import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { funders, type FunderRow } from './schema'
import type { FunderProfile } from '@/lib/agent/funder-match'

export async function listFunders(): Promise<FunderRow[]> {
  return db.select().from(funders).orderBy(asc(funders.name))
}

export async function getFunder(id: string): Promise<FunderRow | undefined> {
  const rows = await db.select().from(funders).where(eq(funders.id, id)).limit(1)
  return rows[0]
}

export function rowToProfile(row: FunderRow): FunderProfile {
  return {
    name: row.name,
    aliases: row.aliases,
    themes: row.themes,
    geographies: row.geographies,
    typicalAmounts: row.typicalAmounts,
    frequency: row.frequency,
    eligibleEntity: row.eligibleEntity,
    requiredDocuments: row.requiredDocuments,
    winningExamples: row.winningExamples,
    contacts: row.contacts,
    language: row.language,
    evaluationCriteria: row.evaluationCriteria,
    lessonsLearned: row.lessonsLearned,
  }
}
