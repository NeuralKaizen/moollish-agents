'use client'

import { useState } from 'react'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { analyzeClient } from '@/lib/ui/analyze-client'
import { OpportunityInput } from '@/components/opportunity-input'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

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
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setStatus('loading')
    setError(null)
    try {
      const result = await analyzeClient(text)
      setAnalysis(result)
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
          Pega una convocatoria y decido si conviene aplicar, con qué vehículo, bajo qué
          narrativa y qué hacer en las próximas 24-72h.
        </p>
        <div className="w-full text-left">
          <OpportunityInput
            value={text}
            onChange={setText}
            onAnalyze={run}
            collapsed={false}
            loading={false}
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
        collapsed={status === 'done'}
        loading={status === 'loading'}
        sourceName={analysis?.source.name}
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

      {status === 'done' && analysis && <AnalysisView analysis={analysis} />}
    </main>
  )
}
