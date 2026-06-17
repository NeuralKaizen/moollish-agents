import 'dotenv/config'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { LlmAnalysisSchema, type LlmAnalysis } from './schema'
import { buildSystemPrompt } from './prompt'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export async function generateWithOpenRouter(text: string, model: string): Promise<LlmAnalysis> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: LlmAnalysisSchema }),
    system: buildSystemPrompt(),
    prompt: `Analizá la siguiente convocatoria y devolvé el análisis estructurado:\n\n${text}`,
  })
  return output
}
