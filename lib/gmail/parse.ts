import type { CorpusInput } from '@/lib/ingest/corpus'
import type { GmailMessage } from './types'

function isPdf(filename: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')
}

export async function messageToCorpusInputs(
  msg: GmailMessage,
  extractPdf: (bytes: Uint8Array) => Promise<string>,
): Promise<{ inputs: CorpusInput[]; notes: string[] }> {
  const inputs: CorpusInput[] = []
  const notes: string[] = []

  const body = msg.body.trim()
  if (body.length > 0) {
    const header = `Correo reenviado — De: ${msg.from} · Asunto: ${msg.subject}`
    inputs.push({ type: 'upload', name: msg.subject || 'Correo', url: null, body: `${header}\n\n${body}` })
  }

  for (const att of msg.attachments) {
    if (!isPdf(att.filename, att.mimeType)) {
      notes.push(`Adjunto omitido (no es PDF): ${att.filename}.`)
      continue
    }
    const text = await extractPdf(att.data)
    if (text.trim().length > 0) {
      inputs.push({ type: 'pdf', name: att.filename, url: null, body: text })
    } else {
      notes.push(`No pude extraer texto del adjunto ${att.filename} (¿PDF escaneado?).`)
    }
  }

  if (inputs.length === 0) notes.push('El correo no traía texto ni PDF legible.')
  return { inputs, notes }
}
