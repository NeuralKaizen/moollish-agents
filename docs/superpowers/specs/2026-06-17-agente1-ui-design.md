# Agente 1 — UI de análisis · Diseño

**Fecha:** 2026-06-17
**Producto:** Moollish Funding Officer AI (Agente 1)
**Alcance de este spec:** SOLO la interfaz web con la que el usuario interactúa con el agente. Frontend puro: sin backend real, sin persistencia, sin conectores.
**Depende de:** el contrato de salida `OpportunityAnalysis` definido en `lib/agent/schema.ts` (fuente de verdad ya existente). El núcleo (`lib/agent/analyze.ts`) lo construye otra sesión en paralelo y NO se toca aquí.
**Rama:** `feat/agente1-ui` (creada desde `feat/agente1-nucleo-analisis`).

---

## 1. Objetivo

Construir la primera versión de la interfaz del Agente 1: una **pantalla única** donde el usuario pega el **texto de una convocatoria** y ve renderizado el **análisis estructurado completo** que produce el agente — semáforo, score explicable con desglose, fit por vehículo, evidencia con citas, gaps, partners, riesgos y próximas acciones — en un orden orientado a la decisión.

El valor: que el usuario entienda de un vistazo **"¿aplico o no, con qué vehículo y qué hago en 24-72h?"**, con todo el detalle auditable debajo.

En esta fase la UI no llama al modelo: se alimenta de un **fixture tipado** contra el contrato. Cuando el núcleo esté listo, se enchufa en un único punto sin reescribir componentes.

---

## 2. Alcance

### Dentro (fase actual)
- App Next.js (App Router) montada sobre el repo existente, alias `@/*`.
- Pantalla única con dos estados: input vacío → análisis renderizado.
- Render completo del contrato `OpportunityAnalysis` en layout **decision-first** (veredicto arriba, detalle debajo).
- Tema **arena + naranja Moollish** (paleta abajo) con Tailwind + shadcn/ui.
- Fixture tipado (`sample-analysis.ts`) y función única `analyzeClient(text)` como punto de swap al backend real.
- Estados de carga (delay simulado) y vacío.

### Fuera (fases posteriores)
- API route real / integración con `lib/agent/analyze.ts` (queda como punto de swap preparado).
- Historial / grilla tipo Excel / comparación de convocatorias.
- Persistencia (Neon, CRM, ciclo de vida).
- Ingestión PDF / URL / multicanal.
- Login / multiusuario.
- Edición de pesos del scoring desde la UI.

---

## 3. Arquitectura

Frontend puro alimentado por un fixture tipado contra `OpportunityAnalysis`. Sin tocar `lib/agent`.

```
app/
  layout.tsx          # shell, fuentes, tema arena
  page.tsx            # pantalla única: input → análisis (estado en cliente con useState)
  globals.css         # tokens de color (arena/naranja) + capa Tailwind
components/
  opportunity-input.tsx   # textarea + botón "Analizar" (estado vacío + colapsado)
  analysis/
    verdict-hero.tsx      # semáforo + overall_score + recommendation + recommended_vehicle + institutional_fit
    score-breakdown.tsx   # los 8 criteria_scores con peso, barra y justificación
    evidence-gaps.tsx     # evidence (citas) + missing_data + main_gap
    partners-risks.tsx    # partners_needed + risks
    next-actions.tsx      # next_actions (24-72h)
    draft-outputs.tsx     # executive_summary + narrative_angle (marcado borrador)
  ui/                 # primitivas shadcn (button, card, badge, textarea, separator…)
lib/
  ui/
    sample-analysis.ts     # fixture: un OpportunityAnalysis completo y válido (caso FAO AgrInno)
    analyze-client.ts      # analyzeClient(text): hoy devuelve el fixture con delay; punto de swap
    format.ts              # helpers de presentación (ver §6)
```

**Punto de swap (clave):** toda la UI invoca `analyzeClient(text): Promise<OpportunityAnalysis>`. Hoy resuelve el fixture tras un delay simulado. Cuando exista `lib/agent/analyze.ts`, `analyzeClient` pasa a hacer `fetch('/api/analyze')` (con un route que importe el núcleo) — **sin cambiar ningún componente**. El tipo `OpportunityAnalysis` ya garantiza compatibilidad.

---

## 4. Flujo y estados

`page.tsx` es un client component con tres estados:

1. **Vacío** — `<OpportunityInput>` ocupa el centro: textarea amplio ("Pegá el texto de la convocatoria…") + botón "Analizar". Sin resultado abajo.
2. **Analizando** — al enviar, `analyzeClient(text)` corre con delay simulado; el botón muestra estado de carga y se muestra un skeleton del análisis.
3. **Con resultado** — el input se colapsa a una barra arriba (con el `source.name` y opción de re-analizar / pegar otra). Debajo se renderiza el análisis en el orden decision-first:
   1. `VerdictHero`
   2. `ScoreBreakdown`
   3. `EvidenceGaps`
   4. `PartnersRisks`
   5. `NextActions`
   6. `DraftOutputs`

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

No hay tests automatizados de UI en este alcance (frontend puro, sin lógica de negocio: el scoring y la decisión los calcula el núcleo). Criterio de aceptación:

- `pnpm dev` levanta la app; la home muestra el input vacío.
- Al pegar texto y dar "Analizar", aparece el análisis completo del fixture en layout decision-first, con el tema arena.
- El fixture valida contra `OpportunityAnalysisSchema` (chequeo en `sample-analysis.ts`, p. ej. `OpportunityAnalysisSchema.parse(...)`).
- `pnpm typecheck` pasa: los componentes tipan contra `OpportunityAnalysis`.
- `analyzeClient` es el único lugar acoplado al origen del dato.

---

## 8. Entregable de esta fase

App Next.js en la rama `feat/agente1-ui` que renderiza un `OpportunityAnalysis` completo (semáforo, score explicable con desglose, fit por vehículo, evidencia, gaps, partners, riesgos, acciones, borradores) en layout decision-first con tema arena + naranja Moollish, lista para enchufar al núcleo en un único punto (`analyzeClient`) cuando `lib/agent/analyze.ts` esté disponible.
