import { discoverFromSecop } from '@/lib/radar/discover'
import { fetchSecopRows } from '@/lib/radar/secop'
import { recordDetected } from '@/lib/db/detected'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const summary = await discoverFromSecop({
      fetchRows: (q) => fetchSecopRows(q),
      recordDetected,
    })
    return Response.json(summary)
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 })
  }
}
