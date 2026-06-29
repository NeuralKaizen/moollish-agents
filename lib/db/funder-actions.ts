'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from './client'
import { funders } from './schema'
import type { NewFunderRow } from './schema'

export async function createFunderAction(row: NewFunderRow): Promise<void> {
  await db.insert(funders).values(row)
    .onConflictDoUpdate({ target: funders.id, set: { ...row, updatedAt: new Date() } })
  revalidatePath('/financiadores')
}

export async function updateFunderAction(
  id: string, patch: Partial<Omit<NewFunderRow, 'id'>>,
): Promise<void> {
  await db.update(funders).set({ ...patch, updatedAt: new Date() }).where(eq(funders.id, id))
  revalidatePath('/financiadores')
}

export async function deleteFunderAction(id: string): Promise<void> {
  await db.delete(funders).where(eq(funders.id, id))
  revalidatePath('/financiadores')
}
