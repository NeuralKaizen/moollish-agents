# Agente 1 — UI de análisis · Diseño

**Fecha:** 2026-06-17
**Producto:** Moollish Funding Officer AI (Agente 1)
**Alcance de este spec:** SOLO la interfaz web con la que el usuario interactúa con el agente, integrada de verdad contra el núcleo ya existente. Sin persistencia ni conectores externos.
**Depende de:** el núcleo `lib/agent/` **ya implementado** — `analyzeOpportunity(text, deps, opts)` (orquestación + scoring por código), `generateWithOpenRouter(text, model)` (LLM vía OpenRouter/AI SDK) y el contrato `OpportunityAnalysis` (`schema.ts`). La UI lo consume; NO lo modifica. Lo único pendiente del núcleo (algunos tests) corre en otra sesión.
**Rama:** `feat/agente1-ui` (creada desde `feat/agente1-nucleo-analisis`; ya contiene todo `lib/agent/`).

---

## 1. Objetivo

Construir la primera versión de la interfaz del Agente 1: una **pantalla única** donde el usuario pega el **texto de una convocatoria** y ve renderizado el **análisis estructurado completo** que produce el agente — semáforo, score explicable con desglose, fit por vehículo, evidencia con citas, gaps, partners, riesgos y próximas acciones — en un orden orientado a la decisión.

El valor: que el usuario entienda de un vistazo **"¿aplico o no, con qué vehículo y qué hago en 24-72h?"**, con todo el detalle auditable debajo.

Como el núcleo ya está implementado, la UI lo invoca **de verdad** a través de un API route de Next.js (server-side, donde vive la `OPENROUTER_API_KEY`). Para iterar el diseño sin gastar llamadas al LLM ni depender de la key, hay un **fixture tipado** que el cliente puede usar como fallback; el acoplamiento al origen del dato vive en un único punto (`analyzeClient`).

---

## 2. Alcance

### Dentro (fase actual)
- App Next.js (App Router) montada sobre el repo existente, alias `@/*`.
- Pantalla única con dos estados: input vacío → análisis renderizado.
- Render completo del contrato `OpportunityAnalysis` en layout **decision-first** (veredicto arriba, detalle debajo).
- Tema **arena + naranja Moollish** (paleta abajo) con Tailwind + shadcn/ui.
- **API route real** (`app/api/analyze`) que invoca `analyzeOpportunity(text, { generate: generateWithOpenRouter })` y devuelve el `OpportunityAnalysis`.
- Función única `analyzeClient(text)` (llama al route; con fallback al fixture en modo dev) y fixture tipado (`sample-analysis.ts`).
- Estados de carga (mientras corre el análisis real), error y vacío.

### Fuera (fases posteriores)
- Historial / grilla tipo Excel / comparación de convocatorias.
- Persistencia (Neon, CRM, ciclo de vida).
- Ingestión PDF / URL / multicanal.
- Login / multiusuario.
- Edición de pesos del scoring desde la UI.

---

## 3. Arquitectura

UI Next.js que consume el núcleo `lib/agent/` (ya existente) vía un API route server-side. Sin tocar `lib/agent`.

```
app/
  layout.tsx               # shell, fuentes, tema arena
  page.tsx                 # pantalla única: input → análisis (estado en cliente con useState)
  globals.css              # tokens de color (arena/naranja) + capa Tailwind
  api/
    analyze/route.ts       # POST { text } → OpportunityAnalysis. Server-side: importa lib/agent.
components/
  opportunity-input.tsx    # textarea + botón "Analizar" (estado vacío + colapsado)
  analysis/
    verdict-hero.tsx       # semáforo + overall_score + recommendation + recommended_vehicle + institutional_fit
    score-breakdown.tsx    # los 8 criteria_scores con peso, barra y justificación
    evidence-gaps.tsx      # evidence (citas) + missing_data + main_gap
    partners-risks.tsx     # partners_needed + risks
    next-actions.tsx       # next_actions (24-72h)
    draft-outputs.tsx      # executive_summary + narrative_angle (marcado borrador)
  ui/                      # primitivas shadcn (button, card, badge, textarea, separator…)
lib/
  ui/
    analyze-client.ts      # analyzeClient(text): fetch('/api/analyze'); fallback al fixture en dev
    sample-analysis.ts     # fixture: un OpportunityAnalysis completo y válido (caso FAO AgrInno)
    format.ts              # helpers de presentación (ver §6)
```

**Integración (clave):**
- `app/api/analyze/route.ts` es un Route Handler server-side. Recibe `POST { text }`, llama a `analyzeOpportunity(text, { generate: generateWithOpenRouter })` y responde el `OpportunityAnalysis` (JSON). La `OPENROUTER_API_KEY` solo vive en el server, nunca llega al cliente.
- Toda la UI invoca `analyzeClient(text): Promise<OpportunityAnalysis>`, que hace `fetch('/api/analyze')`. **Único punto acoplado al origen del dato.** En modo dev (flag de entorno, p. ej. `NEXT_PUBLIC_USE_FIXTURE=1`) puede devolver el fixture sin pegarle al LLM, para iterar diseño sin key ni costo.
- El tipo `OpportunityAnalysis` (importado de `@/lib/agent/schema`) garantiza que route, fixture y componentes hablan el mismo contrato.

---

## 4. Flujo y estados

`page.tsx` es un client component con cuatro estados:

1. **Vacío** — `<OpportunityInput>` ocupa el centro: textarea amplio ("Pegá el texto de la convocatoria…") + botón "Analizar". Sin resultado abajo.
2. **Analizando** — al enviar, `analyzeClient(text)` le pega al API route (el LLM real puede tardar varios segundos); el botón muestra estado de carga y se muestra un skeleton del análisis.
3. **Con resultado** — el input se colapsa a una barra arriba (con el `source.name` y opción de re-analizar / pegar otra). Debajo se renderiza el análisis en el orden decision-first:
   1. `VerdictHero`
   2. `ScoreBreakdown`
   3. `EvidenceGaps`
   4. `PartnersRisks`
   5. `NextActions`
   6. `DraftOutputs`
4. **Error** — si el route falla (sin key, timeout, error del LLM), se muestra un mensaje claro con opción de reintentar; el texto pegado no se pierde.

Sin router, sin persistencia: re-analizar reemplaza el resultado en memoria.

---

## 5. Componentes — qué consume cada uno del contrato

- **VerdictHero** — `semaforo` (color + label), `overall_score`, `recommendation` (label de acción + estilo), `recommended_vehicle` + `vehicle_rationale`, `institutional_fit` (moollish/sat2farm/foundation_nova/alliance con barras), `deadline` (fecha + días restantes), `effort`/`risk`.
- **ScoreBreakdown** — los 8 `criteria_scores` (score 0-100, peso del criterio, barra, `justification` expandible). El peso se toma de la tabla del §9 del spec del núcleo.
- **EvidenceGaps** — `evidence[]` (claim + quote citada + field), `missing_data[]` (badges de alerta), `main_gap`.
- **PartnersRisks** — `partners_needed[]` (gap, ally_type, suggested_role, priority, reason) y `risks[]` (type, description, severity con color).
- **NextActions** — `next_actions[]` (action, responsible, due_date, dependency) como checklist.
- **DraftOutputs** — `executive_summary` y `narrative_angle`, claramente marcados como borrador.

Cada componente recibe solo la porción del objeto que necesita; ninguno conoce el origen del dato (fixture vs API).

---

## 6. Tema (arena + naranja Moollish)

Tokens en `globals.css` (CSS variables, consumidas por Tailwind y shadcn):

| Token | Valor |
|---|---|
| fondo (`--background`) | `#f0ede5` |
| superficie / card (`--surface`) | `#FBFAF6` |
| borde (`--border`) | `#E2DDD0` |
| texto (`--foreground`) | `#2A2620` |
| muted (`--muted-foreground`) | `#8C8475` |
| acento / primary (`--primary`) | `#E2641A` |
| semáforo verde | `#3C7D34` |
| semáforo ámbar | `#9A6B12` |
| semáforo rojo | `#B23A2E` |

Mapa semáforo → color/label: `verde_alto`→verde "Verde alto", `verde_condicionado`→verde "Verde condicionado", `amarillo`→ámbar "Amarillo", `naranja`→ámbar/naranja "Naranja", `rojo`→rojo "Rojo". Mapa `recommendation` → label de acción: `apply_now`→"Aplicar ya", `apply_with_partner`→"Aplicar con socio", `observe`→"Observar", `request_info`→"Pedir información", `discard`→"Descartar". Estos mapeos viven en `lib/ui/format.ts`.

Tipografía: system-ui / sans liviana. Layout centrado, ancho máximo de lectura (~640-720px) coherente con el mockup aprobado.

---

## 7. Validación de esta fase

La lógica de negocio (scoring, semáforo, decisión) ya está testeada en el núcleo; acá no se reimplementa. Criterio de aceptación:

- `pnpm dev` levanta la app; la home muestra el input vacío.
- **Modo dev/fixture** (`NEXT_PUBLIC_USE_FIXTURE=1`): pegar texto y "Analizar" renderiza el análisis del fixture en layout decision-first con tema arena, sin pegarle al LLM.
- **Modo real** (con `OPENROUTER_API_KEY`): `POST /api/analyze` con el texto de una convocatoria devuelve un `OpportunityAnalysis` válido del núcleo y la UI lo renderiza completo.
- El fixture valida contra `OpportunityAnalysisSchema` (chequeo en `sample-analysis.ts`, p. ej. `OpportunityAnalysisSchema.parse(...)`).
- El estado de error se muestra correctamente cuando el route falla (p. ej. sin key).
- `pnpm typecheck` pasa: route, fixture y componentes tipan contra `OpportunityAnalysis`.
- `analyzeClient` es el único lugar de la UI acoplado al origen del dato.

---

## 8. Entregable de esta fase

App Next.js en la rama `feat/agente1-ui` que recibe el texto de una convocatoria, lo manda al núcleo (`analyzeOpportunity` + `generateWithOpenRouter`) vía `POST /api/analyze`, y renderiza el `OpportunityAnalysis` completo (semáforo, score explicable con desglose, fit por vehículo, evidencia, gaps, partners, riesgos, acciones, borradores) en layout decision-first con tema arena + naranja Moollish. Con modo fixture para iterar diseño sin key/costo. Integración real de punta a punta lista para deploy a Vercel.
