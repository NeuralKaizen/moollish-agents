import '../../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from '../config'
import type { OpportunityAnalysis } from '../schema'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const ConceptNoteSchema = z.object({
  problema: z.string().describe('El problema/necesidad que aborda la oportunidad.'),
  solucion: z.string().describe('La solución propuesta por Moollish.'),
  beneficiarios: z.string().describe('Beneficiarios y alcance.'),
  innovacion: z.string().describe('El diferencial/innovación.'),
  resultados: z.string().describe('Resultados esperados.'),
  presupuesto_marco: z.string().describe('Presupuesto marco a alto nivel (sin inventar montos no presentes).'),
  missing_data: z.array(z.string()).describe('Datos ausentes en la fuente necesarios para completar el concept note.'),
})
export type ConceptNote = z.infer<typeof ConceptNoteSchema>
export type ConceptNoteGenerator = (prompt: string, model: string) => Promise<ConceptNote>

const GUARDRAIL = `Sos el copiloto de formulación de Moollish. Generás un BORRADOR de Concept Note.
REGLAS (obligatorias):
- Es un BORRADOR: no es una propuesta final.
- NO inventar requisitos, fechas, montos ni condiciones que no estén en la fuente del análisis.
- Usá y citá la evidencia del análisis; distinguí hechos de interpretación.
- Todo dato ausente que haga falta para el concept note va en missing_data (no lo rellenes con supuestos).`

export function buildConceptNotePrompt(analysis: OpportunityAnalysis, funderBlock: string): string {
  return `${GUARDRAIL}

${funderBlock}

Análisis de la oportunidad (fuente de verdad — no inventes fuera de esto):
${JSON.stringify(analysis, null, 2)}

Devolvé el Concept Note estructurado (problema, solución, beneficiarios, innovación, resultados, presupuesto_marco) y la lista missing_data.`
}

export async function generateConceptNote(
  analysis: OpportunityAnalysis,
  funderBlock: string,
  deps: { generate: ConceptNoteGenerator; model?: string },
): Promise<ConceptNote> {
  const prompt = buildConceptNotePrompt(analysis, funderBlock)
  return deps.generate(prompt, deps.model ?? DEFAULT_MODEL)
}

export async function generateConceptNoteWithOpenRouter(prompt: string, model: string): Promise<ConceptNote> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: ConceptNoteSchema }),
    prompt,
  })
  return output
}
