// scripts/seed.ts
import '../lib/load-env'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { analyzeOpportunity } from '../lib/agent/analyze'
import { generateWithOpenRouter } from '../lib/agent/llm'

const DIR = 'fixtures'
const files = readdirSync(DIR).filter((f) => f.endsWith('.txt'))
const out: Record<string, unknown> = {}

for (const f of files) {
  const key = f.replace(/\.txt$/, '')
  const text = readFileSync(`${DIR}/${f}`, 'utf8')
  console.error(`Analizando ${key}…`)
  try {
    out[key] = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
  } catch (err) {
    console.error(`  ✗ falló ${key}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

writeFileSync('lib/demo/analyses.generated.json', JSON.stringify(out, null, 2) + '\n')
console.error(`✓ ${files.length} análisis → lib/demo/analyses.generated.json`)
