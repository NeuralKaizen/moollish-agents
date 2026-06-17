# Hero centrado de la pantalla de entrada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el estado idle de la pantalla única en un hero centrado con identidad de "director virtual", que se retira al analizar para dar todo el alto a la vista de análisis.

**Architecture:** Cambio puramente de presentación en dos archivos. `OpportunityInput` envuelve su estado expandido en una tarjeta (el colapsado queda igual). `app/page.tsx` bifurca el render: en `idle` muestra un hero centrado a viewport; en `loading`/`done`/`error` mantiene el layout anclado arriba que ya existe.

**Tech Stack:** Next.js (App Router) · React · TypeScript strict · Tailwind v4 · shadcn/ui · tema arena.

## Global Constraints

- Rama `feat/ui-input-hero` (desde `master`). No tocar `lib/agent/` ni los componentes del análisis (`components/analysis/*`), `analyzeClient`, ni el backend.
- ESM, TypeScript strict, alias `@/*`. Copy en español. Package manager pnpm.
- Tema arena ya configurado (tokens `bg-card`, `border-border`, `text-primary`, `text-muted-foreground`, etc.). No agregar tokens nuevos.
- Sin tests automatizados nuevos (cambio presentacional): la validación es `pnpm typecheck` + `pnpm build` + verificación de que la home idle renderiza el hero (curl del texto). La verificación visual fina la hace el humano.
- `next-env.d.ts` permanece gitignoreado (no commitear).
- Marca: usar el emoji 🐂 como placeholder del logo (swappeable a futuro).

---

### Task 1: `OpportunityInput` — estado expandido en tarjeta

**Files:**
- Modify: `components/opportunity-input.tsx`

**Interfaces:**
- Consumes: `Button` (`@/components/ui/button`), `Textarea` (`@/components/ui/textarea`).
- Produces: `OpportunityInput` con la MISMA interfaz de props (`value, onChange, onAnalyze, collapsed, loading, sourceName?`). Solo cambia el render del estado expandido (no colapsado): pasa a ser un contenedor con estilo de tarjeta (`rounded-xl border border-border bg-card p-4 shadow-sm`) con el textarea sin borde adentro.

- [ ] **Step 1: Reemplazar el bloque del estado expandido**

En `components/opportunity-input.tsx`, reemplazar el `return (...)` final (el del estado NO colapsado, actualmente un `<div className="flex flex-col gap-3">` con `<Textarea>` + `<Button>`) por:

```tsx
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Pegá el texto de la convocatoria…"
        className="min-h-48 resize-y border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        onClick={onAnalyze}
        disabled={loading || value.trim().length === 0}
        className="self-end"
      >
        {loading ? 'Analizando…' : 'Analizar'}
      </Button>
    </div>
  )
```

No tocar el bloque `if (collapsed) { ... }` (la barra colapsada queda idéntica). No cambiar imports ni la interfaz de props.

- [ ] **Step 2: Verificar tipos y build**

Run: `pnpm typecheck && pnpm build`
Expected: ambos PASAN.

- [ ] **Step 3: Commit**

```bash
git add components/opportunity-input.tsx
git commit -m "feat: input expandido envuelto en tarjeta (estado colapsado sin cambios)"
```

---

### Task 2: `app/page.tsx` — hero centrado en idle, layout anclado al trabajar

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `OpportunityInput` (Task 1, misma interfaz), `AnalysisView`, `analyzeClient`, `Button`, `Skeleton`, `OpportunityAnalysis`.
- Produces: `Home` (default export) — bifurca por `status`: `idle` → hero centrado; resto → layout anclado arriba (igual que hoy).

- [ ] **Step 1: Reemplazar el contenido completo de `app/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { OpportunityAnalysis } from '@/lib/agent/schema'
import { analyzeClient } from '@/lib/ui/analyze-client'
import { OpportunityInput } from '@/components/opportunity-input'
import { AnalysisView } from '@/components/analysis/analysis-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type Status = 'idle' | 'loading' | 'done' | 'error'

function Brand() {
  return (
    <span>
      <span className="text-lg font-bold text-primary">🐂 moollish</span>{' '}
      <span className="text-muted-foreground">funding officer</span>
    </span>
  )
}

export default function Home() {
  const [status, setStatus] = useState<Status>('idle')
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<OpportunityAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setStatus('loading')
    setError(null)
    try {
      const result = await analyzeClient(text)
      setAnalysis(result)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al analizar.')
      setStatus('error')
    }
  }

  if (status === 'idle') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-4 py-8 text-center">
        <Brand />
        <h1 className="text-3xl font-bold tracking-tight">Tu Chief Funding Officer AI</h1>
        <p className="text-muted-foreground">
          Pegá una convocatoria y decido si conviene aplicar, con qué vehículo, bajo qué
          narrativa y qué hacer en las próximas 24-72h.
        </p>
        <div className="w-full text-left">
          <OpportunityInput
            value={text}
            onChange={setText}
            onAnalyze={run}
            collapsed={false}
            loading={false}
          />
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 px-4 py-8">
      <header className="flex items-center gap-2">
        <Brand />
      </header>

      <OpportunityInput
        value={text}
        onChange={setText}
        onAnalyze={run}
        collapsed={status === 'done'}
        loading={status === 'loading'}
        sourceName={analysis?.source.name}
      />

      {status === 'loading' && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="font-medium">No se pudo analizar la convocatoria.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-3" size="sm" onClick={run}>Reintentar</Button>
        </div>
      )}

      {status === 'done' && analysis && <AnalysisView analysis={analysis} />}
    </main>
  )
}
```

- [ ] **Step 2: Verificar tipos y build**

Run: `pnpm typecheck && pnpm build`
Expected: ambos PASAN.

- [ ] **Step 3: Verificar el hero idle en runtime (modo fixture)**

Asegurar `NEXT_PUBLIC_USE_FIXTURE=1` en `.env.local`. Levantar `pnpm dev` en background, esperar unos segundos, y:

```bash
curl -s http://localhost:3000 | grep -o "Tu Chief Funding Officer AI" | head -1
curl -s http://localhost:3000 | grep -o "Pegá el texto de la convocatoria" | head -1
```

Expected: ambos `grep` matchean (el hero idle renderiza título + input). Detener el dev server. La verificación visual del look (centrado, tarjeta, transición al analizar) la hace el humano.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: hero centrado en idle; layout anclado al analizar"
```

---

## Self-review (controlador)

- **Cobertura del spec:** §2 estados (idle hero / trabajo anclado) → Task 2; §3 input en tarjeta → Task 1; marca persistente (`Brand` en ambos branches) → Task 2; fuera de alcance respetado (no se tocan análisis/backend). ✓
- **Sin placeholders de plan:** todo el código está completo. El 🐂 es un placeholder de producto intencional (no de plan), documentado en Global Constraints.
- **Consistencia de tipos:** `OpportunityInput` mantiene su interfaz de props entre Task 1 y Task 2 (mismas props, mismos tipos). ✓
