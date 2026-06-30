'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SubmissionRow } from '@/lib/db/schema'
import { saveSubmissionAction } from '@/lib/db/submission-actions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DATE_FIELDS: { key: keyof SubmissionRow; label: string }[] = [
  { key: 'fechaPresentacion', label: 'Fecha de presentación' },
  { key: 'fechaResultadoEsp', label: 'Fecha esperada de resultado' },
  { key: 'proximoHitoFecha', label: 'Fecha del próximo hito' },
]

export function SubmissionSection({ opportunityId, submission }: { opportunityId: string; submission: SubmissionRow | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = {
      fechaPresentacion: text('fechaPresentacion'),
      fechaResultadoEsp: text('fechaResultadoEsp'),
      proximoHitoFecha: text('proximoHitoFecha'),
      radicado: text('radicado'),
      proximoHito: text('proximoHito'),
      notas: text('notas'),
    }
    setSaved(false)
    start(async () => {
      await saveSubmissionAction(opportunityId, patch)
      router.refresh()
      setSaved(true)
    })
  }

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold">Seguimiento de la postulación</h2>
      <p className="mb-3 text-xs text-muted-foreground">Registrá fechas y referencias para seguir la postulación y sus deadlines.</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input name="radicado" defaultValue={submission?.radicado ?? ''} placeholder="Radicado / referencia"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        {DATE_FIELDS.map((f) => (
          <label key={f.key as string} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {f.label}
            <input type="date" name={f.key as string} defaultValue={(submission?.[f.key] as string | null) ?? ''}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        ))}
        <input name="proximoHito" defaultValue={submission?.proximoHito ?? ''} placeholder="Próximo hito (descripción)"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <textarea name="notas" defaultValue={submission?.notas ?? ''} placeholder="Notas"
          className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar seguimiento'}</Button>
          {saved && !pending && <span className="text-xs text-muted-foreground">Guardado ✓</span>}
        </div>
      </form>
    </Card>
  )
}
