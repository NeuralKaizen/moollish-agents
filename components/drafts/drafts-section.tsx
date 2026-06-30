'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DraftRow } from '@/lib/db/schema'
import { DRAFT_KINDS, type DraftSection } from '@/lib/agent/drafts/registry'
import { generateDraftAction } from '@/lib/db/draft-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function KindCard({ opportunityId, kind, label, sections, draft }: {
  opportunityId: string; kind: string; label: string; sections: DraftSection[]; draft: DraftRow | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const content = draft?.content ?? null
  const missing = draft?.missingData ?? []

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <Button size="sm" disabled={pending}
          onClick={() => start(async () => { await generateDraftAction(opportunityId, kind); router.refresh() })}>
          {pending ? 'Generando…' : draft ? 'Regenerar' : 'Generar'}
        </Button>
      </div>

      {!draft && <p className="text-sm text-muted-foreground">Generá un borrador a partir del análisis.</p>}

      {content && (
        <div className="flex flex-col gap-3">
          <span className="w-fit rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">BORRADOR</span>
          {sections.map((s) => (
            <div key={s.key}>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{content[s.key] ?? ''}</p>
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

export function DraftsSection({ opportunityId, drafts }: { opportunityId: string; drafts: Map<string, DraftRow> }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Borradores de formulación</p>
      {DRAFT_KINDS.map((dk) => (
        <KindCard key={dk.kind} opportunityId={opportunityId} kind={dk.kind} label={dk.label}
          sections={dk.sections} draft={drafts.get(dk.kind) ?? null} />
      ))}
    </div>
  )
}
