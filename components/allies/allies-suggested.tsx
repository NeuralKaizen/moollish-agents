import type { GapSuggestion } from '@/lib/agent/alliance/match'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function AlliesSuggested({ suggestions }: { suggestions: GapSuggestion[] }) {
  const hasGaps = suggestions.length > 0
  const hasAny = suggestions.some((s) => s.candidates.length > 0)

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Aliados sugeridos</h2>
      {!hasGaps && (
        <p className="text-sm text-muted-foreground">El análisis no identificó brechas de aliados para esta oportunidad.</p>
      )}
      {hasGaps && !hasAny && (
        <p className="text-sm text-muted-foreground">
          No hay aliados en la base que encajen con estas brechas. Cargá aliados en la sección Aliados.
        </p>
      )}
      {hasGaps && hasAny && (
        <div className="flex flex-col gap-4">
          {suggestions.map((s, i) => (
            <div key={i}>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-medium">{s.gap.ally_type}</p>
                <span className="text-xs text-muted-foreground">rol sugerido: {s.gap.suggested_role}</span>
                <Badge variant="outline">prioridad {s.gap.priority}</Badge>
              </div>
              <p className="mb-2 text-sm text-muted-foreground">{s.gap.reason}</p>
              {s.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin aliados que encajen en la base.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {s.candidates.map((c) => (
                    <li key={c.ally.name} className="rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{c.ally.name}</p>
                        <Badge>Fit {c.score}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{c.ally.type}</p>
                      {c.ally.recommendedRole && (
                        <p className="mt-1 text-sm text-muted-foreground">Rol: {c.ally.recommendedRole}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
