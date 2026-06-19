import { describe, it, expect, vi } from 'vitest'
import { createFirecrawlReader } from './firecrawl'

function okFetch(data: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
  })) as unknown as typeof fetch
}

describe('createFirecrawlReader', () => {
  it('scrapePage mapea markdown, links y title', async () => {
    const fetchImpl = okFetch({ markdown: '# Hola', links: ['https://x.org/a.pdf'], metadata: { title: 'Conv' } })
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    const page = await reader.scrapePage('https://x.org')
    expect(page).toEqual({ markdown: '# Hola', links: ['https://x.org/a.pdf'], title: 'Conv' })
  })

  it('llama al endpoint v2 con Bearer y formats markdown+links', async () => {
    const fetchImpl = okFetch({ markdown: 'x', links: [], metadata: { title: null } })
    const reader = createFirecrawlReader({ apiKey: 'secret', fetchImpl })
    await reader.scrapePage('https://x.org')
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://api.firecrawl.dev/v2/scrape')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer secret')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.formats).toEqual(['markdown', 'links'])
    expect(body.url).toBe('https://x.org')
  })

  it('scrapeDoc devuelve el markdown como texto', async () => {
    const fetchImpl = okFetch({ markdown: 'contenido pdf', links: [], metadata: {} })
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    expect(await reader.scrapeDoc('https://x.org/a.pdf')).toEqual({ text: 'contenido pdf' })
  })

  it('lanza si la respuesta no es ok', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch
    const reader = createFirecrawlReader({ apiKey: 'k', fetchImpl })
    await expect(reader.scrapePage('https://x.org')).rejects.toThrow(/500/)
  })

  it('lanza claro si falta la API key', () => {
    expect(() => createFirecrawlReader({ apiKey: '', fetchImpl: okFetch({}) })).toThrow(/FIRECRAWL_API_KEY/)
  })
})
