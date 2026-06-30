import '../../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from '../config'
import type { OpportunityAnalysis } from '../schema'
import { getDraftKind, buildKindSchema } from './registry'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const GUARDRAIL = `Sos el copiloto de formulación de Moollish. Generás un BORRADOR de un entregable de formulación.
REGLAS (obligatorias):
- Es un BORRADOR: no es una versión final.
- NO inventar requisitos, fechas, montos ni condiciones que no estén en la fuente del análisis.
- Usá y citá la evidencia del análisis; distinguí hechos de interpretación.
- Todo dato ausente que haga falta para el entregable va en missing_data (no lo rellenes con supuestos).`

export type DraftGenerator = (prompt: string, schema: z.ZodTypeAny) => Promise<Record<string, unknown>>

export function buildDraftPrompt(kind: string, analysis: OpportunityAnalysis, funderBlock: string): string {
  const dk = getDraftKind(kind)
  if (!dk) throw new Error(`Tipo de borrador desconocido: ${kind}`)
  const sectionList = dk.sections.map((s) => `- ${s.label} (${s.key})`).join('\n')
  return `${GUARDRAIL}

Entregable a generar: ${dk.label}.
Secciones requeridas (devolvé cada una como texto):
${sectionList}

${funderBlock}

Análisis de la oportunidad (fuente de verdad — no inventes fuera de esto):
${JSON.stringify(analysis, null, 2)}

Devolvé cada sección como texto y la lista missing_data.`
}

export async function generateDraft(
  kind: string,
  analysis: OpportunityAnalysis,
  funderBlock: string,
  deps: { generate: DraftGenerator },
): Promise<{ content: Record<string, string>; missingData: string[] }> {
  const prompt = buildDraftPrompt(kind, analysis, funderBlock)
  const schema = buildKindSchema(kind)
  const out = await deps.generate(prompt, schema)
  const { missing_data, ...sections } = out
  const content: Record<string, string> = {}
  for (const [k, v] of Object.entries(sections)) content[k] = typeof v === 'string' ? v : String(v)
  return { content, missingData: Array.isArray(missing_data) ? missing_data.map(String) : [] }
}

export async function generateDraftWithOpenRouter(prompt: string, schema: z.ZodTypeAny): Promise<Record<string, unknown>> {
  const { output } = await generateText({
    model: openrouter(DEFAULT_MODEL),
    output: Output.object({ schema }),
    prompt,
  })
  return output as Record<string, unknown>
}
