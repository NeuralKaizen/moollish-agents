import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="text-lg font-medium">Oportunidad no encontrada</p>
      <p className="mt-1 text-sm text-muted-foreground">Puede que se haya reiniciado la demo.</p>
      <Link href="/pipeline" className="mt-4 inline-block text-primary hover:underline">← Volver al pipeline</Link>
    </main>
  )
}
