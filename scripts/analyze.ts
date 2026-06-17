import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { analyzeOpportunity } from '../lib/agent/analyze'
import { generateWithOpenRouter } from '../lib/agent/llm'

const file = process.argv[2]
if (!file) {
  console.error('Uso: pnpm analyze <archivo.txt>')
  process.exit(1)
}

try {
  const text = readFileSync(file, 'utf8')
  const result = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
  console.log(JSON.stringify(result, null, 2))
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n✗ No se pudo analizar la convocatoria: ${message}`)
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('  → Falta OPENROUTER_API_KEY. Copiá .env.example a .env y cargá tu key de OpenRouter.')
  } else {
    console.error('  → Si es un error de validación del esquema, probá con un modelo que soporte structured output (AGENT_MODEL).')
  }
  process.exit(1)
}
