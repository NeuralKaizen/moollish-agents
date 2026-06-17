import { analyzeOpportunity } from '@/lib/agent/analyze'
import { generateWithOpenRouter } from '@/lib/agent/llm'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as { text?: unknown }
    if (typeof text !== 'string' || text.trim().length === 0) {
      return Response.json({ error: 'Falta el texto de la convocatoria.' }, { status: 400 })
    }
    const analysis = await analyzeOpportunity(text, { generate: generateWithOpenRouter })
    return Response.json(analysis)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al analizar.'
    return Response.json({ error: message }, { status: 500 })
  }
}
