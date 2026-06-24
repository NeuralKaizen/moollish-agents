import './globals.css'
import type { ReactNode } from 'react'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { NavHeader } from '@/components/nav-header'

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: 'Moollish · Funding Officer',
  description: 'Análisis de convocatorias — Agente 1',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body>
        <NavHeader />
        {children}
      </body>
    </html>
  )
}
