# Pantalla de entrada del Agente 1 — Hero centrado · Diseño

**Fecha:** 2026-06-17
**Producto:** Moollish Funding Officer AI (Agente 1) — UI
**Alcance:** Rediseñar SOLO el estado vacío (idle) de la pantalla única para que se sienta un producto, con identidad de "director virtual". Sin tocar el backend ni los componentes del análisis.
**Rama:** `feat/ui-input-hero` (desde `master`).
**Depende de:** la UI ya existente (`app/page.tsx`, `components/opportunity-input.tsx`, tema arena, contrato `OpportunityAnalysis`).

---

## 1. Objetivo

Hoy el estado idle es un textarea suelto + botón, muy pelado. Convertirlo en un **hero centrado** que comunique qué es el agente (un Chief Funding Officer AI que decide si conviene aplicar) y dé entrada clara a pegar la convocatoria. Al empezar a trabajar (analizar), el hero se retira y la vista se ancla arriba para dar todo el alto al análisis.

## 2. Comportamiento por estado

`app/page.tsx` ya maneja `status: 'idle' | 'loading' | 'done' | 'error'`. El cambio es puramente de presentación:

- **`idle`** — Hero centrado vertical y horizontalmente (ocupa el alto del viewport, `min-h-dvh`, contenido centrado), ancho `max-w-xl` (~560px). Pila centrada:
  1. **Marca:** `🐂 moollish · funding officer` (el toro es emoji placeholder; se puede swappear por logo real PNG/SVG más adelante sin cambiar el layout).
  2. **Título:** "Tu Chief Funding Officer AI" (grande, `font-bold`, ~`text-3xl`).
  3. **Bajada:** "Pegá una convocatoria y decido si conviene aplicar, con qué vehículo, bajo qué narrativa y qué hacer en las próximas 24-72h." (`text-muted-foreground`).
  4. **Tarjeta de input:** el `OpportunityInput` expandido, ahora envuelto en una `Card` (textarea + botón **Analizar** abajo a la derecha).
- **`loading` / `done` / `error`** — El hero grande **NO se renderiza**. En su lugar, un **header chico** persistente arriba (`🐂 moollish · funding officer`, alineado a la izquierda, anclado al top), seguido de:
  - el `OpportunityInput` **colapsado** (la barra existente con `source.name` + "Re-analizar"),
  - y debajo el skeleton (loading) / `AnalysisView` (done) / card de error (error) — **sin cambios** respecto a hoy.

La marca nunca desaparece: el header chico es la forma condensada del hero.

## 3. Componentes

- **`app/page.tsx`** — bifurca el render por estado:
  - Si `status === 'idle'`: layout centrado (`min-h-dvh`, `flex`, `items-center`, `justify-center`) con el bloque hero (marca + título + bajada + `OpportunityInput` no colapsado).
  - Si no: layout anclado arriba (como hoy: `max-w-3xl`, `py-8`) con header chico + `OpportunityInput` colapsado + loading/done/error.
  - El `<header>` chico actual se reutiliza para los estados de trabajo; el hero es un bloque nuevo solo-idle.
- **`components/opportunity-input.tsx`** — el estado **expandido** (no colapsado) pasa a estar envuelto en una `Card` (`@/components/ui/card`), con el textarea adentro y el botón Analizar abajo a la derecha. El estado **colapsado** queda **igual** (la barra). La interfaz de props no cambia.

## 4. Fuera de alcance

- Logo real (queda el emoji placeholder hasta tener el asset).
- Ayudas extra de carga (ejemplo, contador, subir PDF/URL): no en esta iteración.
- Cambios en los 6 componentes del análisis, skeleton, error, `analyzeClient`, backend, contrato.

## 5. Validación

- `pnpm typecheck` y `pnpm build` pasan.
- `pnpm dev` en modo fixture: la home muestra el hero centrado; al pegar texto y "Analizar", el hero se retira, aparece el header chico + el input colapsado + el análisis. (Verificación visual fina: humano.)
- No se modifica `lib/agent/` ni los tests existentes (siguen verdes).

## 6. Entregable

`app/page.tsx` y `components/opportunity-input.tsx` actualizados: estado idle como hero centrado con identidad de director virtual, transición limpia a la vista de trabajo anclada arriba; resto de la app intacto.
