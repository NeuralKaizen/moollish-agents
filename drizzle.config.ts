import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config()
config({ path: '.env.local', override: true })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
