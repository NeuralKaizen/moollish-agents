const DATASET = process.env.DATOS_GOV_DATASET ?? 'p6dx-8zbt'
const BASE = `https://www.datos.gov.co/resource/${DATASET}.json`

export function buildSecopUrl(opts: { q?: string; limit?: number }): string {
  const params = new URLSearchParams()
  if (opts.q) params.set('$q', opts.q)
  params.set('$limit', String(opts.limit ?? 50))
  return `${BASE}?${params.toString()}`
}

export async function fetchSecopRows(
  q: string,
  deps: { fetchImpl?: typeof fetch; appToken?: string } = {},
): Promise<Record<string, unknown>[]> {
  const doFetch = deps.fetchImpl ?? fetch
  const headers: Record<string, string> = {}
  const token = deps.appToken ?? process.env.DATOS_GOV_APP_TOKEN
  if (token) headers['X-App-Token'] = token
  const res = await doFetch(buildSecopUrl({ q, limit: 50 }), { headers })
  if (!res.ok) throw new Error(`SECOP/Datos Abiertos respondió ${res.status}.`)
  return (await res.json()) as Record<string, unknown>[]
}
