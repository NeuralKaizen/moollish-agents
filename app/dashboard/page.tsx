// app/dashboard/page.tsx
import { DashboardView } from '@/components/dashboard/dashboard-view'

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Dashboard ejecutivo</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Qué apareció, qué vale la pena, qué requiere acción y qué riesgos hay.
      </p>
      <DashboardView />
    </main>
  )
}
