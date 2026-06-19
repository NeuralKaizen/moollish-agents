import type { Reader, PageContent } from './types'
import { FIRECRAWL_TIMEOUT_MS } from './config'

const ENDPOINT = 'https://api.firecrawl.dev/v2/scrape'

interface ScrapeResponse {
  success: boolean
  error?: string
  data?: {
    markdown?: string
    links?: string[]
    metadata?: { title?: string | null }
  }
}

export function createFirecrawlReader(
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Reader {
  const apiKey = opts.apiKey ?? process.env.FIRECRAWL_API_KEY
  const doFetch = opts.fetchImpl ?? fetch
  if (!apiKey) {
    throw new Error('Falta FIRECRAWL_API_KEY para leer URLs. Pega el texto o sube el PDF.')
  }

  async function scrape(url: string, formats: string[]): Promise<NonNullable<ScrapeResponse['data']>> {
    const res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ url, formats, timeout: FIRECRAWL_TIMEOUT_MS }),
    })
    if (!res.ok) throw new Error(`Firecrawl respondió ${res.status} al leer ${url}.`)
    const json = (await res.json()) as ScrapeResponse
    if (!json.success || !json.data) throw new Error(json.error ?? `No pude leer ${url}.`)
    return json.data
  }

  return {
    async scrapePage(url): Promise<PageContent> {
      const data = await scrape(url, ['markdown', 'links'])
      return {
        markdown: data.markdown ?? '',
        links: data.links ?? [],
        title: data.metadata?.title ?? null,
      }
    },
    async scrapeDoc(url) {
      const data = await scrape(url, ['markdown'])
      return { text: data.markdown ?? '' }
    },
  }
}
