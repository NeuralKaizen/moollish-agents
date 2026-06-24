import { config } from 'dotenv'

// Carga .env y luego .env.local (con override), igual que Next.js, para que los
// runners CLI (pnpm analyze / pnpm ingest) vean las claves que el usuario guarda
// en .env.local. Importar este módulo ANTES que cualquiera que lea process.env.
config()
config({ path: '.env.local', override: true })
