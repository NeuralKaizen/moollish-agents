import { extractText, getDocumentProxy } from 'unpdf'

// Extrae la capa de texto de un PDF digital. PDFs escaneados (solo imagen)
// devuelven cadena vacía: el orquestador lo reporta como nota honesta (sin OCR en esta fase).
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes)
  const { text } = await extractText(pdf, { mergePages: true })
  return text
}
