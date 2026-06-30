'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { allies } from './schema'
import type { NewAllyRow } from './schema'

export async function createAllyAction(row: NewAllyRow): Promise<void> {
  await db.insert(allies).values(row)
    .onConflictDoUpdate({ target: allies.id, set: { ...row, updatedAt: new Date() } })
  revalidatePath('/aliados')
}

export async function updateAllyAction(
  id: string, patch: Partial<Omit<NewAllyRow, 'id'>>,
): Promise<void> {
  await db.update(allies).set({ ...patch, updatedAt: new Date() }).where(eq(allies.id, id))
  revalidatePath('/aliados')
}

export async function deleteAllyAction(id: string): Promise<void> {
  await db.delete(allies).where(eq(allies.id, id))
  revalidatePath('/aliados')
}
