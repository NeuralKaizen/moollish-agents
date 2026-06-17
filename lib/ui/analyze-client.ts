import type { OpportunityAnalysis } from '@/lib/agent/schema'

export async function analyzeClient(text: string): Promise<OpportunityAnalysis> {
  if (process.env.NEXT_PUBLIC_USE_FIXTURE === '1') {
    const { SAMPLE_ANALYSIS } = await import('./sample-analysis')
    await new Promise((resolve) => setTimeout(resolve, 600))
    return SAMPLE_ANALYSIS
  }

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Error ${res.status} al analizar la convocatoria.`)
  }
  return res.json() as Promise<OpportunityAnalysis>
}
