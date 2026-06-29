import { desc, eq } from 'drizzle-orm'
import { db } from './client'
import { opportunities } from './schema'
import { rowToOpportunity } from './mappers'
import type { DemoOpportunity } from '@/lib/demo/types'

export async function listOpportunities(): Promise<DemoOpportunity[]> {
  const rows = await db.select().from(opportunities).orderBy(desc(opportunities.createdAt))
  return rows.map(rowToOpportunity)
}

export async function getOpportunity(id: string): Promise<DemoOpportunity | undefined> {
  const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1)
  return rows[0] ? rowToOpportunity(rows[0]) : undefined
}
