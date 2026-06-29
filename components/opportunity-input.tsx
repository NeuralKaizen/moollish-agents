'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface OpportunityInputProps {
  value: string
  onChange: (value: string) => void
  onAnalyze: () => void
  onPickFile: (file: File | null) => void
  file: File | null
  fileName: string | null
  collapsed: boolean
  loading: boolean
  progress?: string | null
  canAnalyze: boolean
  sourceName?: string
  presets?: { id: string; label: string }[]
  onPickPreset?: (id: string) => void
}

export function OpportunityInput({
  value, onChange, onAnalyze, onPickFile, file, fileName,
  collapsed, loading, progress, canAnalyze, sourceName,
  presets, onPickPreset,
}: OpportunityInputProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const isImage = file?.type.startsWith('image/') ?? false
  const previewUrl = useMemo(() => (isImage && file ? URL.createObjectURL(file) : null), [isImage, file])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function onPaste(e: React.ClipboardEvent) {
    const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); onPickFile(img) }
  }

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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" onPaste={onPaste}>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-xs text-muted-foreground">Casos reales:</span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPickPreset?.(p.id)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pega el enlace (URL), el texto, o pegá una captura (Ctrl/Cmd+V)…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      {fileName && (
        <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {previewUrl
              ? <img src={previewUrl} alt="captura" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span>📄</span>}
            <span className="truncate">{fileName}</span>
          </span>
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
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading}>
          Subir PDF o captura
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
