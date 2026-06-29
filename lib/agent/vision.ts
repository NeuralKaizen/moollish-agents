import '../load-env'
import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { DEFAULT_MODEL } from './config'

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })

export const VISION_MODEL = process.env.VISION_MODEL ?? DEFAULT_MODEL

export const VisionExtractSchema = z.object({
  text: z.string().describe('Transcripción fiel del texto visible en la imagen. Vacío si no hay texto legible.'),
  detected_url: z.string().nullable().describe('URL de la convocatoria si aparece o es claramente inferible; si no, null.'),
  source_guess: z.string().nullable().describe('Fuente probable, p. ej. "Instagram @fao" o "correo de FONTAGRO"; si no se infiere, null.'),
})
export type VisionExtract = z.infer<typeof VisionExtractSchema>
export type VisionExtractor = (bytes: Uint8Array, mime: string) => Promise<VisionExtract>

export function toImageDataUrl(bytes: Uint8Array, mime: string): string {
  const base64 = Buffer.from(bytes).toString('base64')
  return `data:${mime};base64,${base64}`
}

const SYSTEM = `Sos un asistente que lee capturas de pantalla de convocatorias de financiación.
Transcribí fielmente TODO el texto visible. No inventes datos que no estén en la imagen.
Si ves una URL de la convocatoria, devolvela en detected_url. Si podés inferir la fuente
(red social, cuenta, remitente de correo), devolvela en source_guess. Si algo es ilegible, omitilo.`

export async function generateVisionExtract(
  bytes: Uint8Array, mime: string, model: string = VISION_MODEL,
): Promise<VisionExtract> {
  const { output } = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: VisionExtractSchema }),
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Leé esta captura de una convocatoria y devolvé el extracto estructurado.' },
        { type: 'image', image: toImageDataUrl(bytes, mime) },
      ],
    }],
  })
  return output
}
