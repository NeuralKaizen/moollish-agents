import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida (revisá .env.local)')

// prepare:false → compatible con el pooler de Supabase (pgbouncer, transaction mode).
const client = postgres(url, { prepare: false })

export const db = drizzle(client, { schema })
