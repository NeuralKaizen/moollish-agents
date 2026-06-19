const DOC_EXT = /\.(pdf|docx?|xlsx?)(\?|#|$)/i
const DOC_KEYWORDS = /(pliego|t[eé]rminos|terminos|anexo|cronograma|convocatoria|bases|tdr)/i

export function selectDocumentLinks(
  links: string[],
  opts: { pageUrl: string; maxDocs: number },
): string[] {
  const { pageUrl, maxDocs } = opts
  let host: string | null = null
  try { host = new URL(pageUrl).host } catch { host = null }

  const seen = new Set<string>()
  const scored: { url: string; sameHost: boolean }[] = []

  for (const raw of links) {
    let abs: string
    try { abs = new URL(raw, pageUrl).toString() } catch { continue }
    if (seen.has(abs)) continue
    if (!DOC_EXT.test(abs) && !DOC_KEYWORDS.test(abs)) continue
    seen.add(abs)
    let sameHost = false
    try { sameHost = host != null && new URL(abs).host === host } catch { sameHost = false }
    scored.push({ url: abs, sameHost })
  }

  // Mismo dominio primero; Array.sort es estable, así se preserva el orden original dentro de cada grupo.
  scored.sort((a, b) => Number(b.sameHost) - Number(a.sameHost))
  return scored.slice(0, maxDocs).map((s) => s.url)
}

export function docNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : url
  } catch {
    return url
  }
}
