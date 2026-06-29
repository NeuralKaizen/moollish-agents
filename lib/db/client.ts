import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Database = PostgresJsDatabase<typeof schema>

let instance: Database | null = null

// Inicialización perezosa: importar este módulo NO conecta ni lanza. El error por
// DATABASE_URL ausente recién salta en el primer uso real (una query), para que los
// tests de integración con `describe.skipIf(!DATABASE_URL)` se salten limpiamente
// sin romper al importar.
function getDb(): Database {
  if (instance) return instance
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL no está definida (revisá .env.local)')
  // prepare:false → compatible con el pooler de Supabase (pgbouncer, transaction mode).
  instance = drizzle(postgres(url, { prepare: false }), { schema })
  return instance
}

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb()
    const value = real[prop as keyof Database]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
  },
})
