# Stack profesional — Plataforma de agentes Moollish (uso interno)

> Diseño validado en brainstorming. Fecha: 2026-06-28.
> Contexto: el Agente 1 hoy es un analizador + demo de venta sobre `localStorage`/seed
> (ver `docs/agente1-estado-y-roadmap.md` y `docs/superpowers/specs/2026-06-23-agente1-demo-venta-design.md`).
> Este spec define el **stack de base** sobre el que se construirá el Agente 1 "de verdad"
> (persistencia + radar + RAG + CRM + orquestación) y los próximos agentes.

## Objetivo y restricciones

Definir un stack **suficiente y profesional** para una solución de **uso interno, no comercial**,
que corra **barato sobre Vercel + Supabase** y no quede atrapada en un proveedor.

Restricciones acordadas:
- **No comercial / interno** → no hace falta infra de escala ni multi-tenant comercial.
- **Costo bajo** → objetivo $0–$45/mes (Vercel + Supabase free/low tier + OpenRouter por uso).
- **Suficiente, no sobre-ingeniado** → se descartan worker dedicado, contenedores, monorepo
  con Turborepo, Testcontainers y vector-DB dedicada. No aportan valor a este volumen.
- **Portabilidad razonable** → Postgres estándar + Drizzle permiten mudar de proveedor sin
  reescribir el dominio, sin pagar el costo de operar infra propia hoy.

## El stack

| Capa | Tecnología | Rol |
|---|---|---|
| App (UI + API) | **Next.js 16 + React 19** (ya existe) | Web, route handlers y Server Actions, desplegado en Vercel. |
| Estilos / UI | **Tailwind 4 + shadcn/ui** (ya existe) | Componentes y diseño. |
| Tareas programadas (radar §7) | **Vercel Cron** | Despierta funciones en horario para descubrir/normalizar oportunidades. Sin proceso prendido. |
| Base de datos | **Supabase Postgres** | Persistencia del modelo §15. |
| Búsqueda semántica (RAG §11) | **pgvector** (en el mismo Postgres) | Embeddings de documentos y repositorio interno, con citas. |
| Acceso a datos | **Drizzle ORM** | Capa tipada sobre Postgres; mantiene el dominio portable. |
| Auth y roles (§22) | **Supabase Auth** | Login, sesiones y roles. |
| Archivos (PDFs, capturas) | **Supabase Storage** | Documentos por oportunidad (§15 Documentos). |
| LLM | **AI SDK v6 + OpenRouter** (ya existe) | Generación y análisis; provider vía OpenRouter. |
| Validación / esquemas | **Zod 4** (ya existe) | Esquemas compartidos UI/servidor/DB. |
| Observabilidad LLM | **Langfuse Cloud (free)** — diferible | Trazas de agentes: decisiones, tokens, costo, latencia. |
| Testing | **Vitest** (ya existe) | Lógica de dominio + tests de DB contra Postgres de prueba. |

Lo que **ya está** en el repo se mantiene tal cual; lo que se **agrega** es: Supabase
(DB+Auth+Storage), Drizzle, pgvector, Vercel Cron y Langfuse (cuando se active el tracing).

## Arquitectura

### Forma del sistema
Un **único proyecto Next.js en Vercel** (no hay worker aparte ni contenedores).

- **UI**: App Router (client/server components), como hoy.
- **API**: route handlers + Server Actions.
- **Dominio**: vive en `lib/` separado de la UI, como ya ocurre (`lib/agent`, `lib/ingest`).
- **Background / radar**: **funciones que Vercel Cron invoca** en horario. Para el volumen
  interno, cada corrida cabe en una invocación (timeout de funciones 300s); si una fuente es
  grande, se reparte el trabajo en varias corridas o ítems en cola en tabla.

### Capa de datos — reemplazo de `lib/demo/` por `lib/db/`
La capa actual `lib/demo/` (store en `localStorage` + seed) es **la costura** que aísla las
pantallas del origen de datos. Se **reescribe como `lib/db/`** con Drizzle contra Supabase,
manteniendo interfaces equivalentes (`list`, `getById`, `add`, `updateState`, `toggleTask`…)
para que las pantallas (`/pipeline`, `/dashboard`, `/oportunidad/[id]`) **no cambien**.

- Esquema Drizzle del **modelo §15**: Oportunidades, Financiadores, Aliados, Contactos,
  Documentos, Tareas, Propuestas, Scores, Lecciones.
- pgvector para embeddings (documentos de oportunidad + repositorio interno).
- El seed actual (`lib/demo/seed.ts` / `analyses.generated.json`) se convierte en **seed de la
  base** para poblar demos.

### Flujo de una oportunidad
```
entra (radar/cron  ó  Alex pega URL/PDF/texto)
  → ingesta (Firecrawl / unpdf / OCR)        [lib/ingest]
  → análisis del agente (AI SDK + OpenRouter) [lib/agent]
  → persistencia en Postgres con estado de pipeline
  → visible en pipeline / dashboard
  → genera tareas
  → aprobación humana antes de cualquier envío externo (§22)
```

### Agentes y orquestación (§17)
Subagentes como **funciones tipadas en código** coordinadas sin framework externo:
Radar, Eligibility (ya existe), Partnership, Proposal, Executive Briefing. Cada corrida se
**traza en Langfuse** (cuando se active) para auditoría de decisiones, tokens y costo (§22).

## Manejo de errores
- Fallo de LLM o de una fuente: la oportunidad **no se corrompe**; se marca incompleta /
  `missing_data`, como ya hace el análisis hoy. El radar registra el error y reintenta en la
  próxima corrida.
- Storage/DB no disponible: la operación falla de forma limpia y se informa en UI; no se
  escriben estados parciales (transacciones de Drizzle).
- Aprobación humana obligatoria como guardrail antes de envíos externos (§22), nunca automático.

## Testing
- **Vitest** para dominio (scoring, agregaciones del dashboard, dedup del radar, mapeos).
- Tests de `lib/db/` contra un Postgres de prueba (proyecto/branch Supabase de test o Postgres
  local efímero). Sin Testcontainers ni e2e por ahora (se suman solo si hacen falta).
- Se mantienen los tests verdes existentes.

## Costo estimado (uso interno, bajo volumen)
- **Vercel**: gratis (Hobby) o ~$20/mes (Pro, lo correcto para uso interno de empresa).
- **Supabase**: free tier inicial; ~$25/mes si crece.
- **OpenRouter**: pago por uso (centavos por análisis).
- **Langfuse**: free tier.
- **Total**: ~$0–$45/mes.

## Variables de entorno (para la fase de implementación)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` (connection string de Postgres para Drizzle)
- `OPENROUTER_API_KEY` (ya presente)
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` (diferible)

Todas en `.env.local` / variables de Vercel; nunca en el repo.

## Fuera de alcance (decisiones ya descartadas para este contexto)
- Worker dedicado / contenedores / Docker-compose.
- Monorepo con Turborepo; Testcontainers; Playwright (por ahora).
- Vector-DB dedicada (Pinecone/Weaviate); cola externa (BullMQ/Redis); Temporal/Inngest.
- Multi-tenant comercial / facturación.

## Relación con el roadmap del Agente 1
Este stack es el cimiento de la **Fase A** del roadmap (`docs/agente1-estado-y-roadmap.md`):
persistencia real + CRM + dashboard sobre datos reales, reemplazando la demo `localStorage`.
Las fases siguientes (radar, RAG de donantes, motor de alianzas, copiloto de formulación,
orquestación y gobernanza) se construyen sobre estas mismas capas sin cambiar el stack.
