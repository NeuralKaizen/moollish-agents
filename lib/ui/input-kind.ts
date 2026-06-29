export type AnalyzeInput =
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; file: File }
  | { kind: 'image'; file: File }

export function looksLikeUrl(s: string): boolean {
  const t = s.trim()
  if (t.length === 0 || /\s/.test(t)) return false
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function decideInput(value: string, file: File | null): AnalyzeInput | null {
  if (file) return (file.type || '').startsWith('image/') ? { kind: 'image', file } : { kind: 'pdf', file }
  const t = value.trim()
  if (t.length === 0) return null
  return looksLikeUrl(t) ? { kind: 'url', url: t } : { kind: 'text', text: t }
}
