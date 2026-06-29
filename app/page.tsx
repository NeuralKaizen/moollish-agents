'use client'

import { useState } from 'react'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import type { IngestionSummary } from '@/lib/ingest/types'
import { analyzeClient } from '@/lib/ui/analyze-client'
import { decideInput } from '@/lib/ui/input-kind'
import { OpportunityInput } from '@/components/opportunity-input'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { IngestionSummaryView } from '@/components/analysis/ingestion-summary'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DEMO_PRESETS } from '@/lib/demo/presets'
import { addOpportunityAction } from '@/lib/db/actions'
import Link from 'next/link'

type Status = 'idle' | 'loading' | 'done' | 'error'

function Brand() {
  return (
    <span>
      <span className="text-lg font-bold text-primary">🐂 moollish</span>{' '}
      <span className="text-muted-foreground">funding officer</span>
    </span>
  )
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null)
  const [ingestion, setIngestion] = useState<IngestionSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canAnalyze = decideInput(text, file) !== null

  async function run() {
    const input = decideInput(text, file)
    if (!input) return
    setStatus('loading')
    setError(null)
    setProgress(null)
    try {
      const result = await analyzeClient(input, setProgress)
      setAnalysis(result.analysis)
      await addOpportunityAction(result.analysis)
      setIngestion(result.ingestion)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar.')
      setStatus('error')
    }
  }

  if (status === 'idle') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-4 py-8 text-center">
        <Brand />
        <h1 className="text-3xl font-bold tracking-tight">Tu Chief Funding Officer AI</h1>
        <p className="text-muted-foreground">
          Pega el enlace o el texto de una convocatoria (o sube su PDF) y decido si conviene
          aplicar, con qué vehículo, bajo qué narrativa y qué hacer en las próximas 24-72h.
        </p>
        <div className="w-full text-left">
          <OpportunityInput
            value={text}
            onChange={setText}
            onAnalyze={run}
            onPickFile={setFile}
            fileName={file?.name ?? null}
            collapsed={false}
            loading={false}
            canAnalyze={canAnalyze}
            presets={DEMO_PRESETS.map(({ id, label }) => ({ id, label }))}
            onPickPreset={(id) => {
              const p = DEMO_PRESETS.find((x) => x.id === id)
              if (p) { setFile(null); setText(p.text) }
            }}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center gap-2">
        <Brand />
      </header>

      <OpportunityInput
        value={text}
        onChange={setText}
        onAnalyze={run}
        onPickFile={setFile}
        fileName={file?.name ?? null}
        collapsed={status === 'done'}
        loading={status === 'loading'}
        progress={progress}
        canAnalyze={canAnalyze}
        sourceName={analysis?.source.name}
        presets={DEMO_PRESETS.map(({ id, label }) => ({ id, label }))}
        onPickPreset={(id) => {
          const p = DEMO_PRESETS.find((x) => x.id === id)
          if (p) { setFile(null); setText(p.text) }
        }}
      />

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">No se pudo analizar la convocatoria.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-3" size="sm" onClick={run}>Reintentar</Button>
        </div>
      )}

      {status === 'done' && analysis && (
        <Link href={`/oportunidad/${analysis.opportunity_id}`} className="text-sm text-primary hover:underline">
          Ver en el pipeline →
        </Link>
      )}
      {status === 'done' && ingestion && <IngestionSummaryView ingestion={ingestion} />}
      {status === 'done' && analysis && <AnalysisView analysis={analysis} />}
    </main>
  )
}
