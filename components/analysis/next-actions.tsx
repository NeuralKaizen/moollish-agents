import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { Card } from '@/components/ui/card'

function fmtDate(iso: string | null): string {
  if (!iso) return 'sin fecha'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'sin fecha' : d.toLocaleDateString('es-CO')
}

export function NextActions({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <Card className="border-l-4 border-l-primary p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Próximas acciones · 24-72h
      </p>
      <ul className="flex flex-col gap-2">
        {analysis.next_actions.map((a, i) => (
          <li key={i} className="text-sm">
            <span className="mr-2">☐</span>
            {a.action}
            <span className="text-muted-foreground">
              {' — '}{a.responsible} · {fmtDate(a.due_date)}
              {a.dependency ? ` · depende de: ${a.dependency}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
