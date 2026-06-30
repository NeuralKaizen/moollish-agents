import { asc, eq } from 'drizzle-orm'
import { db } from './client'
import { allies, type AllyRow } from './schema'
import type { AllyProfile } from '@/lib/agent/alliance/match'

export async function listAllies(): Promise<AllyRow[]> {
  return db.select().from(allies).orderBy(asc(allies.name))
}

export async function getAlly(id: string): Promise<AllyRow | undefined> {
  const rows = await db.select().from(allies).where(eq(allies.id, id)).limit(1)
  return rows[0]
}

export function rowToProfile(row: AllyRow): AllyProfile {
  return {
    name: row.name,
    type: row.type,
    country: row.country,
    capabilities: row.capabilities,
    recommendedRole: row.recommendedRole,
    reputation: row.reputation,
  }
}
