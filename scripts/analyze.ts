import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { analyzeOpportunity } from '../lib/agent/analyze'
import { generateWithOpenRouter } from '../lib/agent/llm'

const file = process.argv[2]
if (!file) {
  console.error('Uso: pnpm analyze <archivo.txt>')
  process.exit(1)
}

const text = readFileSync(file, 'utf8')
const result = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
console.log(JSON.stringify(result, null, 2))
