// components/dashboard/widget-card.tsx
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function WidgetCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </Card>
  )
}
