import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground p-8 flex flex-col gap-4 items-start">
      <h1 className="text-xl font-bold">Moollish · Funding Officer</h1>
      <Card className="p-4">Tarjeta arena</Card>
      <Button>Botón naranja</Button>
    </main>
  )
}
