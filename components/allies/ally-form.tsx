'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { AllyRow } from '@/lib/db/schema'
import { createAllyAction, updateAllyAction } from '@/lib/db/ally-actions'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const FIELDS: { key: keyof AllyRow; label: string }[] = [
  { key: 'country', label: 'País' },
  { key: 'capabilities', label: 'Capacidades (qué hacen)' },
  { key: 'experience', label: 'Experiencia' },
  { key: 'contact', label: 'Contacto' },
  { key: 'recommendedRole', label: 'Rol recomendado' },
]

export function AllyForm({ ally, onDone }: { ally?: AllyRow; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const editing = !!ally

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const id = String(fd.get('id') ?? '').trim()
    const name = String(fd.get('name') ?? '').trim()
    const type = String(fd.get('type') ?? '').trim()
    const reputation = String(fd.get('reputation') ?? '').trim() as AllyRow['reputation']
    if (!name || !type || !['alto', 'medio', 'bajo'].includes(reputation)) {
      setError('Nombre, tipo y reputación son obligatorios.'); return
    }
    const text = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v.length ? v : null }
    const patch = Object.fromEntries(FIELDS.map((f) => [f.key, text(f.key as string)]))
    setError(null)
    start(async () => {
      if (editing) await updateAllyAction(ally!.id, { name, type, reputation, ...patch })
      else await createAllyAction({ id: id || name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, type, reputation, ...patch })
      router.refresh()
      onDone?.()
    })
  }

  return (
    <Card className="mb-6 p-5">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{editing ? `Editar ${ally!.name}` : 'Nuevo aliado'}</p>
        {!editing && <input name="id" placeholder="id (slug, opcional)" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />}
        <input name="name" defaultValue={ally?.name ?? ''} placeholder="Nombre *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="type" defaultValue={ally?.type ?? ''} placeholder="Tipo (universidad, ONG, alcaldía, socio internacional…) *" className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select name="reputation" defaultValue={ally?.reputation ?? 'medio'} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="alto">Reputación: alto</option>
          <option value="medio">Reputación: medio</option>
          <option value="bajo">Reputación: bajo</option>
        </select>
        {FIELDS.map((f) => (
          <textarea key={f.key as string} name={f.key as string} defaultValue={(ally?.[f.key] as string | null) ?? ''} placeholder={f.label}
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
