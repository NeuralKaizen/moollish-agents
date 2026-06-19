import type { IngestSource } from './types'

export interface CorpusInput {
  type: IngestSource['type']
  name: string
  url: string | null
  body: string
}

function heading(input: CorpusInput): string {
  const label = input.type === 'page' ? 'Página' : 'Documento'
  const suffix = input.url ? ` (${input.url})` : ''
  return `${label}: ${input.name}${suffix}`
}

export function assembleCorpus(
  inputs: CorpusInput[],
  opts: { maxCharsPerDoc: number; totalBudget: number },
): { text: string; sources: IngestSource[]; truncated: boolean } {
  const { maxCharsPerDoc, totalBudget } = opts
  let truncated = false
  let used = 0
  const blocks: string[] = []
  const sources: IngestSource[] = []

  for (const input of inputs) {
    let body = input.body
    if (body.length > maxCharsPerDoc) { body = body.slice(0, maxCharsPerDoc); truncated = true }
    const remaining = totalBudget - used
    if (body.length > remaining) { body = body.slice(0, Math.max(0, remaining)); truncated = true }

    blocks.push(`### ${heading(input)}\n${body}`)
    sources.push({ type: input.type, name: input.name, url: input.url, chars: body.length })
    used += body.length
  }

  return { text: blocks.join('\n\n'), sources, truncated }
}
