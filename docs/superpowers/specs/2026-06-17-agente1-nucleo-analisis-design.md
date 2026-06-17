# Agente 1 — Núcleo de análisis · Diseño

**Fecha:** 2026-06-17
**Producto:** Moollish Funding Officer AI (Agente 1 — Chief Funding, Partnerships & Strategic Opportunities Officer AI)
**Alcance de este spec:** SOLO el núcleo de análisis del agente. Sin interfaz, sin persistencia, sin conectores.
**Fuente de verdad funcional:** `agents-profiles/Especificacion_Profesional_Agente_1_Moollish_Funding_Officer_AI (1).pdf`

---

## 1. Objetivo

Construir un módulo TypeScript que reciba el **texto de una convocatoria** y devuelva un **análisis estructurado, explicable y auditable** que respete el contrato obligatorio de Moollish (§8 "Salida obligatoria" + Anexo A + Anexo C de la spec).

El módulo se desarrolla y se valida por **CLI**, sin UI. Queda como una unidad bien delimitada que la interfaz y la persistencia (fases posteriores) consumirán sin reescribirlo.

El valor no es "responder lindo": es **capturar, analizar, puntuar de forma trazable y recomendar una acción** sobre cada oportunidad, sin inventar datos.

---

## 2. Alcance

### Dentro (Fase actual)
- Análisis de una convocatoria a partir de texto pegado.
- Salida estructurada completa según Anexo C (contrato Zod).
- Scoring explicable y determinístico con pesos configurables.
- Semáforo → decisión, con override a `request_info` si falta dato crítico.
- Clasificación taxonómica (§6), normalización (§7) y motor de alianzas a nivel análisis (§12).
- `draft_outputs` **liviano**: resumen ejecutivo pulido + ángulo narrativo sugerido.
- Conocimiento de financiadores (§11) embebido como contexto estático en el prompt.
- Runner CLI + fixtures con los casos reales del §20 como criterio de aceptación.

### Fuera (fases posteriores)
- Interfaz web / grilla tipo Excel / dashboard.
- Persistencia en Neon Postgres, CRM y ciclo de vida (§14).
- Ingestión PDF / URL / multicanal (correo, WhatsApp, Instagram, SECOP, Grants.gov) (§16).
- RAG sobre repositorio institucional (§4, §11 como base viva).
- Copiloto de formulación completo: Concept Note extenso, Teoría de Cambio, Marco Lógico, presupuesto, cronograma, matriz de riesgos (§13, ubicado en V3 por la spec).
- Base de aliados con Alliance Fit Score completo (§12 versión profunda).
- Analítica predictiva y aprendizaje sobre histórico (§24, V4).
- Login / multiusuario / human-in-the-loop de envío.

---

## 3. Arquitectura del módulo

Scaffolding **Next.js (App Router) + Vercel AI SDK** (stack ya decidido para el producto), pero en esta fase solo se trabaja la capa de agente:

```
lib/agent/
  schema.ts        # Esquema Zod = contrato de salida (Anexo C). Única fuente de verdad del modelo.
  prompt.ts        # Prompt maestro (system): identidad, reglas §18, criterios, fit, guardrails.
  funders.ts       # Conocimiento estático de financiadores (§11) inyectado en el prompt.
  scoring.ts       # Scoring determinístico: pesos, suma ponderada, semáforo, decisión, override.
  analyze.ts       # analyzeOpportunity(text, opts) -> OpportunityAnalysis. Orquesta LLM + scoring.
  config.ts        # Modelo por defecto, pesos por defecto, env vars.
scripts/
  analyze.ts       # Runner CLI: pnpm analyze <archivo.txt> -> imprime JSON estructurado.
fixtures/
  *.txt            # Casos reales del §20 (FAO AgrInno, FONTAGRO, DIV Fund, Minciencias 966, SECOP CAR).
  expected.md      # Respuesta esperada de cada caso (del §20) para validación.
```

**Separación de responsabilidades clave:** el LLM razona y asigna sub-scores con justificación; **el código calcula el score total, el semáforo y la decisión**. Así el scoring es explicable, los pesos son ajustables sin tocar el prompt, y el resultado es reproducible (criterio de aceptación §21: "calcula score explicable y ajustable; guarda pesos y justificación").

---

## 4. Contrato de salida (esquema Zod = Anexo C)

`analyzeOpportunity` devuelve un objeto validado contra este esquema. Campos:

- **`opportunity_id`** `string` — id interno generado.
- **`source`** `object` — `{ name, url?, file?, channel, captured_at (ISO), confidence_level: 'alta'|'media'|'baja' }`.
- **`classification`** `object` *(§6)* — `{ category: enum, subcategory?, instrument?, themes: string[], geography: string[] }`. `category ∈ {financiacion_no_reembolsable, contratacion_publica, cooperacion_alianzas, programas_territoriales, inversion_impacto}`.
- **`deadline`** `{ date: ISO|null, days_remaining: number|null, verified: boolean }` — si no existe, `null` + se agrega tarea de verificación a `next_actions`.
- **`funding_amount`** `{ value: number|null, currency: string|null, confirmed: boolean, estimated_cop?: number|null, estimated_usd?: number|null, range_min?, range_max? }` — moneda original; estimación COP/USD **marcada como estimada**, nunca presentada como dato confirmado.
- **`eligibility`** `{ eligible_entities: string[], countries: string[], restrictions: string[], required_documents: string[], gaps: string[] }`.
- **`recommended_vehicle`** `enum` *(§2, §8)* — `'moollish' | 'moollish_sat2farm' | 'foundation_nova' | 'alianza'` + `vehicle_rationale: string`.
- **`fit_scores`** `object` — sub-scores 0-100 **con justificación** por cada uno de los 8 criterios (ver §5), más:
  - `moollish: 0-100`, `sat2farm: 0-100`, `foundation_nova: 0-100`, `alliance: 0-100` (compatibilidad de aplicar en alianza).
  - `effort: 'bajo'|'medio'|'alto'`, `risk: 'bajo'|'medio'|'alto'` *(§10 score paralelo)*.
- **`overall_score`** `number` — **calculado por código** (suma ponderada). No lo produce el LLM.
- **`semaforo`** `enum` — `'verde_alto'|'verde_condicionado'|'amarillo'|'naranja'|'rojo'` — **calculado por código**.
- **`recommendation`** `enum` — `'apply_now'|'apply_with_partner'|'observe'|'request_info'|'discard'` — **derivado por código** del semáforo, con override a `request_info` si falta dato crítico.
- **`main_gap`** `string` — la brecha principal a resolver *(ejemplo Anexo C)*.
- **`partners_needed`** `array` *(§12)* — `{ gap, ally_type, suggested_role, priority: 'alta'|'media'|'baja', reason }`.
- **`risks`** `array` — `{ type: 'legal'|'reputacional'|'financiero'|'tecnico'|'tiempo'|'ejecucion', description, severity }`.
- **`next_actions`** `array` — `{ action, responsible, due_date (ISO|null), dependency? }` (acción concreta en 24-72h).
- **`evidence`** `array` — `{ claim, quote, field }`: fragmento textual de la fuente que respalda cada fecha/monto/requisito. **Toda afirmación factual debe tener evidencia o marcarse como inferencia.**
- **`missing_data`** `string[]` — datos críticos faltantes detectados.
- **`draft_outputs`** `object` *(liviano)* — `{ executive_summary, narrative_angle }`. Marcado como borrador.
- **`analysis_meta`** `object` — `{ model, weights_version, analyzed_at (ISO) }` para auditoría.

---

## 5. Prompt maestro

Codifica la identidad y reglas del §18:

**Identidad:** Chief Funding, Partnerships & Strategic Opportunities Officer AI de Moollish + Sat2Farm + Foundation Nova. No es un buscador de convocatorias; es un director virtual que decide si conviene aplicar, con qué vehículo, bajo qué narrativa y qué hacer en 24-72h.

**Criterios de scoring (sub-score 0-100 + justificación cada uno), con sus pesos (§9):**

| Criterio | Peso |
|---|---|
| Alineación estratégica | 20% |
| Elegibilidad jurídica/institucional | 15% |
| Monto y retorno esperado | 15% |
| Probabilidad de éxito | 15% |
| Complejidad documental | 10% |
| Tiempo disponible | 10% |
| Impacto estratégico | 10% |
| Riesgo de ejecución | 5% |

**Fit institucional:** compatibilidad 0-100 con Moollish (negocio productivo-tecnológico), Sat2Farm (satelital, carbono, biodiversidad, precisión), Foundation Nova (social, comunitario, juventud, mujeres), y alianza. Recomendar el vehículo líder.

**Conocimiento de financiadores (§11)** embebido como contexto: FAO, FONTAGRO, DIV Fund, Minciencias, ADR/MinAgricultura, CAR/entidades ambientales, UE/Horizon/Innovate UK — sus patrones, prioridades y uso estratégico.

**Guardrails obligatorios (§18):**
1. **No inventar** — si falta un dato crítico, marcarlo en `missing_data` y agregar tarea de verificación; nunca rellenar.
2. **Citar fuente** — toda fecha límite, monto, elegibilidad o requisito debe tener su fragmento en `evidence`.
3. **Separar hechos de inferencias** — distinguir lo textual de la convocatoria vs interpretación estratégica.
4. **Priorizar acción** — el análisis siempre termina con decisión y próxima acción concreta.

El esquema se fuerza con `generateObject` (AI SDK), que valida y reintenta si el modelo no cumple la estructura.

---

## 6. Scoring determinístico (código, no LLM)

`scoring.ts`:

1. Toma los 8 sub-scores 0-100 que devolvió el LLM.
2. `overall_score = Σ (sub_score_i × peso_i)`, con pesos de `config.ts` (versionados → `weights_version`).
3. Mapea `overall_score` → semáforo (cortes §10):
   - `85-100` → `verde_alto`
   - `70-84` → `verde_condicionado`
   - `55-69` → `amarillo`
   - `40-54` → `naranja`
   - `0-39` → `rojo`
4. Deriva `recommendation` del semáforo (§10):
   - `verde_alto` → `apply_now`
   - `verde_condicionado` → `apply_with_partner`
   - `amarillo` → `observe`
   - `naranja` → `observe`
   - `rojo` → `discard`
5. **Override:** si `missing_data` contiene un dato crítico (deadline, elegibilidad o monto ausente/ no verificable), `recommendation = 'request_info'` independientemente del score.

Pesos editables sin tocar prompt ni código (vía `config.ts` / env). Reproducible para auditoría.

---

## 7. Normalización (§7)

- Fechas → ISO 8601; calcular `days_remaining`.
- Monto → conservar moneda original; estimación COP/USD opcional, **siempre marcada `estimated`** y nunca como confirmada.
- Países/temas → etiquetas controladas en `classification`.

---

## 8. Validación: runner CLI + fixtures

- **Runner:** `pnpm analyze fixtures/<caso>.txt` imprime el objeto estructurado (JSON legible).
- **Fixtures:** los 5 casos reales del §20, con su "respuesta esperada" en `fixtures/expected.md`:
  - FAO AgrInno → compatibilidad alta Moollish/Sat2Farm, aliados internacionales, concept note preliminar.
  - FONTAGRO ganadería regenerativa → necesidad de país socio, centro de investigación, teoría de cambio.
  - DIV Fund piloto rural → costo-efectividad, beneficiarios, medición, escalabilidad.
  - Minciencias 966 → roles universidad-empresa, presupuesto, indicadores CTeI.
  - SECOP CAR monitoreo ambiental → oferta Sat2Farm + Moollish, requisitos habilitantes, competencia.
- **Criterio de aceptación (§21):** para cada fixture el agente (a) extrae los datos clave con citas, (b) marca faltantes en vez de inventar, (c) produce score explicable con desglose, (d) recomienda vehículo y decisión coherentes con la "respuesta esperada", (e) termina con acción concreta.

---

## 9. Configuración

- **Modelo:** `claude-sonnet-4-6` por defecto (velocidad + calidad fuerte). Override a `claude-opus-4-8` por env (`AGENT_MODEL`) para máxima calidad.
- **API key:** `ANTHROPIC_API_KEY` en `.env` (server-side; la provee el usuario).
- **Pesos:** defaults del §9 en `config.ts`, sobre-escribibles.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Alucinación de requisitos | Citas obligatorias (`evidence`) + separación hechos/inferencias + `missing_data`. |
| Score no alineado con criterio real de Moollish | Pesos configurables + validación contra casos reales §20. |
| Datos faltantes presentados como ciertos | Override a `request_info` + `missing_data` + tareas de verificación. |
| Dependencia de formato del texto pegado | `generateObject` con reintento; el agente tolera texto crudo de convocatorias. |

---

## 11. Entregable de esta fase

`lib/agent/` funcional + runner CLI que, sobre los 5 casos reales del §20, produce análisis estructurados que respetan el contrato completo de Moollish (Anexo A / Anexo C / §8), con scoring explicable y sin inventar datos. Listo para que la interfaz y Neon se enchufen encima.
