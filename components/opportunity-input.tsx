'use client'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface OpportunityInputProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  collapsed: boolean
  loading: boolean
  sourceName?: string
}

export function OpportunityInput({
  value, onChange, onAnalyze, collapsed, loading, sourceName,
}: OpportunityInputProps) {
  if (collapsed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <span className="truncate text-sm text-muted-foreground">
          {sourceName ?? 'Convocatoria analizada'}
        </span>
        <Button variant="outline" size="sm" onClick={onAnalyze} disabled={loading}>
          {loading ? 'Analizando…' : 'Re-analizar'}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pegá el texto de la convocatoria…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        onClick={onAnalyze}
        disabled={loading || value.trim().length === 0}
        className="self-end"
      >
        {loading ? 'Analizando…' : 'Analizar'}
      </Button>
    </div>
  )
}
