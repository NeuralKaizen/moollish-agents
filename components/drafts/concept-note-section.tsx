'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DraftRow } from '@/lib/db/schema'
import { generateConceptNoteAction } from '@/lib/db/draft-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ConceptNoteContent {
  problema: string; solucion: string; beneficiarios: string
  innovacion: string; resultados: string; presupuesto_marco: string
}
const SECTIONS: { key: keyof ConceptNoteContent; label: string }[] = [
  { key: 'problema', label: 'Problema' },
  { key: 'solucion', label: 'Solución' },
  { key: 'beneficiarios', label: 'Beneficiarios' },
  { key: 'innovacion', label: 'Innovación' },
  { key: 'resultados', label: 'Resultados' },
  { key: 'presupuesto_marco', label: 'Presupuesto marco' },
]

export function ConceptNoteSection({ opportunityId, draft }: { opportunityId: string; draft: DraftRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const content = draft?.content as ConceptNoteContent | undefined
  const missing = (draft?.missingData ?? []) as string[]

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Concept Note</p>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => { await generateConceptNoteAction(opportunityId); router.refresh() })}>
          {pending ? 'Generando…' : draft ? 'Regenerar' : 'Generar concept note'}
        </Button>
      </div>

      {!draft && <p className="text-sm text-muted-foreground">Generá un borrador de concept note a partir del análisis.</p>}

      {content && (
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">BORRADOR</span>
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{content[s.key]}</p>
            </div>
          ))}
          {missing.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-800">Datos faltantes (verificar):</p>
              <ul className="mt-1 list-disc pl-5 text-amber-800">
                {missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
