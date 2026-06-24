# Agente 1 — Estado actual vs. PDF y roadmap a 100%

> Fuente de verdad: `agents-profiles/Especificacion_Profesional_Agente_1_Moollish_Funding_Officer_AI (1).pdf` (v1.0, 18 págs).
> Objetivo: construir el Agente 1 **completo** del PDF (plataforma modular de inteligencia de financiación), no una versión mini.
> Última actualización: 2026-06-24.

## TL;DR

Hoy tenemos **el cerebro de decisión** funcionando y validado en vivo: el flujo `ingest (URL/PDF/texto) → análisis ejecutivo estructurado con scoring explicable, semáforo, evidencia y acciones`. Eso es el Módulo 2 (parcial) + Módulo 3 (completo) + el Prompt Maestro (§18). Es la parte más difícil y diferenciadora, y ya pasa el caso real FAO del §20.

Lo que falta para el 100% es, sobre todo, **convertir ese análisis de un acto puntual en un sistema**: persistencia + CRM + dashboard, conectores de entrada reales, radar de descubrimiento, perfiles vivos de donantes (RAG), motor de alianzas, copiloto de formulación y orquestación multi-agente con gobernanza.

Estimación honesta de avance global ≈ **25-30%** por superficie, pero ≈ **90%** del núcleo de análisis (lo más valioso).

---

## Mapa módulo por módulo (PDF §3-§24)

Leyenda: ✅ hecho · 🟡 parcial · ❌ falta

| # | Módulo / sección PDF | Estado | Qué hay hoy | Qué falta para el 100% |
|---|---|---|---|---|
| §7 | **M1 · Radar global** (descubrimiento programado) | ❌ 0% (infra ~10%) | Solo ingesta *pull* (el usuario pega). La capa `lib/ingest` (Firecrawl + seguimiento de links + unpdf) es reutilizable. | Búsquedas programadas, conectores de fuente, normalización, **deduplicación**, pre-filtro por keywords (Anexo D), registro como "Detectada". |
| §8 | **M2 · Análisis enviado por Alex** | 🟡 70% | URL (Firecrawl), PDF subido (unpdf), texto pegado. Corpus multi-documento con presupuesto. Respuesta ejecutiva en streaming. | **OCR de capturas** Instagram/LinkedIn (vision), **correo reenviado** (parseo de remitente/adjuntos). |
| §9/§10 | **M3 · Elegibilidad, scoring y semáforo** | ✅ 95% | 8 criterios ponderados explicables, polaridad correcta, semáforo 5 niveles, decisión, fit institucional, esfuerzo, riesgo. Validado en vivo. | UI para **editar pesos** sin tocar código (Anexo E admin) · guardar la justificación para auditoría/aprendizaje (depende de persistencia). |
| §11 | **M4 · Inteligencia de donantes** | 🟡 20% | Bloque estático `FUNDER_KNOWLEDGE` (7 financiadores) embebido en el prompt. | **Perfiles vivos** por financiador (tabla §15): temas, geografías, montos, frecuencia, documentos, ejemplos ganadores, contactos, criterios, lecciones. **RAG** con citas. |
| §12 | **M5 · Motor de alianzas** | 🟡 25% | `partners_needed` por análisis (brecha, tipo, rol, prioridad, razón). | **Base de aliados** persistente, **Alliance Fit Score** multifactor, **mensajes de acercamiento** (borrador), mapa de aliados, mínimo 3 tipos (Anexo E). |
| §13 | **M6 · Estructuración preliminar** | 🟡 10% | `draft_outputs` = resumen ejecutivo + ángulo narrativo. `risks[]` cubre algo de matriz de riesgos. | **Concept note**, **teoría de cambio**, **marco lógico**, **presupuesto preliminar**, **cronograma** — como borradores con guardrail de "no inventar". |
| §14 | **M7 · CRM y ciclo de vida** | ❌ 0% | Nada. Cada análisis es efímero. | **Pipeline de 10 estados** (Detectada→…→Descartada), registro con estado/valor/deadline/responsable/tareas/documentos/aliados/razón. |
| §15 | **Modelo de datos** | ❌ 5% | Tipos Zod en memoria para un análisis (cubre la forma de "Oportunidad" y "Score"). | Persistencia real: Oportunidades, **Financiadores, Aliados, Contactos, Documentos, Tareas, Propuestas, Scores, Lecciones**. |
| §16 | **Integraciones** | 🟡 10% | Firecrawl (web) + unpdf (PDF). | Gmail/Outlook, WhatsApp, Instagram/LinkedIn, **SECOP/Datos Abiertos**, EU/Grants.gov/UNGM/World Bank, Notion/Airtable/HubSpot, Make/n8n, Drive/SharePoint. |
| §17 | **Subagentes y orquestación** | 🟡 15% | Una sola llamada LLM = "Eligibility Analyst". | Radar / Partnership / Proposal / CRM Operator / Executive Briefing como subagentes, **tracing/observabilidad**, escalado a humano. |
| §18 | **Prompt maestro y reglas** | ✅ 100% | Identidad, alcance, no-inventar, citar fuente, separar hechos, priorizar acción, normalizar, **polaridad de scores**, **taxonomía §6**, contexto temporal, salida obligatoria Anexo A. | Reforzar reglas de "humano en el loop" y "aprendizaje" cuando existan esos flujos. |
| §19 | **Dashboard ejecutivo** | ❌ 0% | Vista de un solo análisis. | Widgets: oportunidades nuevas, pipeline por estado, **top 10 aplicar**, riesgos críticos, aliados requeridos, recursos potenciales, **acciones de hoy**. |
| §22 | **Seguridad y gobernanza** | 🟡 10% | Evidencia + `analysis_meta` dan trazabilidad por análisis. | **Auth/roles**, log de auditoría persistente, retención, **aprobación humana** antes de envíos. |
| §24 | **KPIs y metas** | ❌ 0% | Sin métricas. | Detectadas/calificadas/priorizadas, propuestas, alianzas, tiempo de análisis, tasa de descarte, recursos (depende del CRM). |

### Frontend / UX
- ✅ Entrada inteligente URL/texto/PDF con decisión de tipo, progreso en streaming, resumen de ingestión.
- ✅ Vista de análisis completa: verdict hero, desglose de score, evidencia/gaps, aliados/riesgos, próximas acciones, draft outputs.
- ❌ Sin historial, sin lista/tablero de pipeline, sin dashboard, sin editor de pesos, sin subir captura.

---

## Roadmap a 100% (alineado al §23 del PDF)

Orden propuesto: primero el **esqueleto que da memoria** (lo que el PDF llama "crear memoria, radar y criterio"), luego entrada automática, luego las capacidades avanzadas.

### Fase A — Memoria: Persistencia + CRM + Dashboard `[M7 §14 · §15 · §19]`
El cambio que convierte "analizador de una convocatoria" en **el Agente 1**.
- Decisión de almacenamiento (ver "Decisiones abiertas").
- Modelo de datos §15 (empezar por Oportunidad, Score, Tarea, Financiador, Aliado).
- Guardar cada análisis con estado del pipeline; transiciones de estado.
- Dashboard ejecutivo §19 (top prioridades, acciones de hoy, riesgos, pipeline).
- Editor de pesos del scoring (Anexo E).

### Fase B — Entrada completa `[M2 §8 · M16 conectores P1]`
- OCR de capturas (vision) y correo reenviado.
- Conector **correo** (Gmail) → buzón dedicado a oportunidades.
- **SECOP / Datos Abiertos** (Colombia) y luego EU/Grants.gov/UNGM/World Bank.

### Fase C — Radar de descubrimiento `[M1 §7]`
- Búsquedas programadas sobre los conectores de la Fase B.
- Deduplicación, pre-filtro (Anexo D), normalización → alimenta el CRM como "Detectada".

### Fase D — Inteligencia de donantes viva + RAG `[M4 §11 · §15]`
- Perfiles de financiador estructurados y versionados.
- Índice RAG sobre repositorio interno (propuestas, casos) y documentos de oportunidad, con citas.
- Reemplaza el `FUNDER_KNOWLEDGE` estático.

### Fase E — Motor de alianzas `[M5 §12]`
- Base de aliados, Alliance Fit Score, mensajes de acercamiento, mapa de aliados por rol/prioridad.

### Fase F — Copiloto de formulación `[M6 §13]`
- Concept note, teoría de cambio, marco lógico, presupuesto, cronograma, matriz de riesgos — borradores con guardrail.

### Fase G — Orquestación multi-agente + gobernanza `[M17 §17 · §22]`
- Subagentes especializados + tracing/observabilidad.
- Aprobación humana, auth/roles, log de auditoría.

### Fase H — Aprendizaje y predicción `[§24 · V4]`
- Lecciones aprendidas, tasa de éxito, ajuste de pesos por histórico, analítica predictiva.

---

## Decisiones abiertas (a resolver antes de la Fase A)
1. **Almacenamiento**: el repo está linkeado a Vercel. Opciones del Marketplace: **Neon Postgres** (relacional, encaja con el modelo §15) o Upstash/Redis (más liviano). ¿Postgres + Drizzle/Prisma?
2. **Auth**: ¿lo necesitamos en Fase A o lo diferimos a Fase G? (Define si el CRM es single-tenant interno o multiusuario).
3. **Alcance del MVP "presentable"**: ¿la primera entrega completa es Fase A+B (capturar + analizar + guardar + tablero + correo), o sumamos ya el radar (Fase C)?

---

## Lo verificado en vivo (baseline de calidad)
- Caso FAO AgrInnovation 2026 (`fixtures/fao-agrinno.txt`): extrae deadline `2026-09-30` verificada, `USD 250.000` confirmado, elegibilidad con citas literales, recomienda `alianza` al detectar el límite de entidad con ánimo de lucro. Polaridad de scores correcta. `next_actions` a 24-72h reales.
- Suite: 82 tests verdes, typecheck limpio.
- Harness de aceptación: `for f in fixtures/*.txt; do echo "=== $f ==="; pnpm analyze "$f"; done` contra `fixtures/expected.md` (§20).
