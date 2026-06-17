import type { ReactNode } from 'react'

export const metadata = {
  title: 'Moollish · Funding Officer',
  description: 'Análisis de convocatorias — Agente 1',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
