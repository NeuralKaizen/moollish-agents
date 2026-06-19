'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface OpportunityInputProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  onPickFile: (file: File | null) => void
  fileName: string | null
  collapsed: boolean
  loading: boolean
  progress?: string | null
  canAnalyze: boolean
  sourceName?: string
}

export function OpportunityInput({
  value, onChange, onAnalyze, onPickFile, fileName,
  collapsed, loading, progress, canAnalyze, sourceName,
}: OpportunityInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)

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
        placeholder="Pega el enlace (URL) de la convocatoria o su texto…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {fileName && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="truncate">📄 {fileName}</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => { onPickFile(null); if (fileRef.current) fileRef.current.value = '' }}
          >
            Quitar
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
          Subir PDF
        </Button>
        <div className="flex items-center gap-3">
          {loading && progress && (
            <span className="text-sm text-muted-foreground">{progress}</span>
          )}
          <Button onClick={onAnalyze} disabled={loading || !canAnalyze}>
            {loading ? 'Analizando…' : 'Analizar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
