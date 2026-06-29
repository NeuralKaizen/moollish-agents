'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import type { DemoOpportunity } from '@/lib/demo/types'
import { toggleOpportunityTaskAction } from '@/lib/db/actions'
import { Card } from '@/components/ui/card'

export function TaskList({ o }: { o: DemoOpportunity }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tareas</p>
      <ul className="flex flex-col gap-2">
        {o.tasks.map((t, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={t.done}
              disabled={pending}
              onChange={() => start(async () => { await toggleOpportunityTaskAction(o.analysis.opportunity_id, i); router.refresh() })}
              className="mt-1"
            />
            <span className={t.done ? 'text-muted-foreground line-through' : ''}>
              {t.action}
              <span className="text-muted-foreground"> · {t.responsible}{t.due_date ? ` · ${t.due_date.slice(0, 10)}` : ''}</span>
            </span>
          </li>
        ))}
        {o.tasks.length === 0 && <li className="text-sm text-muted-foreground">Sin tareas.</li>}
      </ul>
    </Card>
  )
}
