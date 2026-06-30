'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SubmissionRow } from '@/lib/db/schema'
import type { Resultado } from '@/lib/agent/tracking/lessons'
import { recordOutcomeAction, saveLessonToFunderAction } from '@/lib/db/submission-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const LESSON_STATUS_MSG = {
  anexada: 'Lección anexada al financiador ✓',
  sin_financiador: 'No se identificó un financiador con perfil cargado.',
  sin_leccion: 'Escribí y guardá la lección antes de anexarla.',
} as const

export function OutcomeSection({ opportunityId, submission }: { opportunityId: string; submission: SubmissionRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [lessonPending, startLesson] = useTransition()
  const [lessonMsg, setLessonMsg] = useState<string | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const r = String(fd.get('resultado') ?? '').trim()
    const resultado: Resultado | null = (r === 'ganada' || r === 'perdida' || r === 'otro') ? r : null
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    setSaved(false); setSaveError(false)
    start(async () => {
      try {
        await recordOutcomeAction(opportunityId, { resultado, montoOtorgado: text('montoOtorgado'), leccion: text('leccion') })
        router.refresh()
        setSaved(true)
      } catch (err) {
        console.error('[outcome-section] no se pudo guardar el resultado:', err)
        setSaveError(true)
      }
    })
  }

  function anexar() {
    setLessonMsg(null)
    startLesson(async () => {
      try {
        const res = await saveLessonToFunderAction(opportunityId)
        router.refresh()
        setLessonMsg(LESSON_STATUS_MSG[res.status])
      } catch (err) {
        console.error('[outcome-section] no se pudo anexar la lección:', err)
        setLessonMsg('Error al anexar la lección.')
      }
    })
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold">Resultado y lección aprendida</h2>
      <p className="mb-3 text-xs text-muted-foreground">Al marcar ganada/perdida se actualiza el estado. La lección se puede anexar al financiador.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Resultado
          <select name="resultado" defaultValue={submission?.resultado ?? ''}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
            <option value="">—</option>
            <option value="ganada">Ganada</option>
            <option value="perdida">Perdida</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <input name="montoOtorgado" defaultValue={submission?.montoOtorgado ?? ''} placeholder="Monto otorgado (si ganada)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <textarea name="leccion" defaultValue={submission?.leccion ?? ''} placeholder="Lección aprendida"
          className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar resultado'}</Button>
          {saved && !pending && <span className="text-xs text-muted-foreground">Guardado ✓</span>}
          {saveError && !pending && <span className="text-xs text-red-600">Error al guardar. Reintentá.</span>}
        </div>
      </form>
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" disabled={lessonPending || !submission?.leccion} onClick={anexar}>
          {lessonPending ? 'Anexando…' : 'Guardar lección al financiador'}
        </Button>
        {submission?.leccionAnexada && !lessonMsg && <span className="text-xs text-muted-foreground">Ya anexada al financiador ✓</span>}
        {lessonMsg && <span className="text-xs text-muted-foreground">{lessonMsg}</span>}
      </div>
    </Card>
  )
}
