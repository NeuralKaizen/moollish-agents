'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { FunderRow } from '@/lib/db/schema'
import { createFunderAction, updateFunderAction } from '@/lib/db/funder-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const FIELDS: { key: keyof FunderRow; label: string }[] = [
  { key: 'themes', label: 'Temas/prioridades' },
  { key: 'geographies', label: 'Geografías' },
  { key: 'typicalAmounts', label: 'Montos típicos' },
  { key: 'frequency', label: 'Frecuencia' },
  { key: 'eligibleEntity', label: 'Tipo de entidad elegible' },
  { key: 'requiredDocuments', label: 'Documentos exigidos' },
  { key: 'winningExamples', label: 'Ejemplos ganadores' },
  { key: 'contacts', label: 'Contactos' },
  { key: 'language', label: 'Idioma' },
  { key: 'evaluationCriteria', label: 'Criterios de evaluación' },
  { key: 'lessonsLearned', label: 'Lecciones aprendidas' },
]

export function FunderForm({ funder, onDone }: { funder?: FunderRow; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editing = !!funder

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const id = String(fd.get('id') ?? '').trim()
    const name = String(fd.get('name') ?? '').trim()
    const aliases = String(fd.get('aliases') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!name || aliases.length === 0) { setError('Nombre y al menos un alias son obligatorios.'); return }
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = Object.fromEntries(FIELDS.map((f) => [f.key, text(f.key as string)]))
    setError(null)
    start(async () => {
      if (editing) await updateFunderAction(funder!.id, { name, aliases, ...patch })
      else await createFunderAction({ id: id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, aliases, ...patch })
      router.refresh()
      onDone?.()
    })
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{editing ? `Editar ${funder!.name}` : 'Nuevo financiador'}</p>
        {!editing && <input name="id" placeholder="id (slug, opcional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />}
        <input name="name" defaultValue={funder?.name ?? ''} placeholder="Nombre *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="aliases" defaultValue={funder?.aliases.join(', ') ?? ''} placeholder="Alias separados por coma *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        {FIELDS.map((f) => (
          <textarea key={f.key as string} name={f.key as string} defaultValue={(funder?.[f.key] as string | null) ?? ''} placeholder={f.label}
            className="min-h-16 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}</Button>
          {editing && onDone && <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>}
        </div>
      </form>
    </Card>
  )
}
