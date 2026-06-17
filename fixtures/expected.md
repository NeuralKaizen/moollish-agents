# Respuestas esperadas — criterio de aceptación (§20 / §21)

Cada sección describe lo que un análisis CORRECTO del Agente 1 debe contener para el fixture correspondiente.
La corrida de aceptación se ejecuta con: `for f in fixtures/*.txt; do echo "=== $f ==="; pnpm analyze "$f"; done`

---

## fao-agrinno

**Fixture:** `fixtures/fao-agrinno.txt` — FAO AgrInnovation Challenge 2026, subvención no reembolsable, hasta USD 250.000, cierre 30 de septiembre de 2026.

### Campos críticos que el agente DEBE extraer con evidencia

- `classification.category`: `financiacion_no_reembolsable`
- `classification.themes`: incluye agricultura inteligente, resiliencia climática, seguridad alimentaria, monitoreo satelital
- `deadline.date`: `2026-09-30` (ISO 8601), `deadline.verified: true`
- `funding_amount.value`: `250000`, `funding_amount.currency`: `USD`, `funding_amount.confirmed: true`
- `eligibility.eligible_entities`: incluye organizaciones sin fines de lucro, centros de investigación, consorcios público-privados
- `recommended_vehicle`: `moollish_sat2farm` (componente tecnológico productivo + capa satelital explícita en la convocatoria)
- `partners_needed`: al menos un partner con `ally_type` de implementador local / socio internacional
- `draft_outputs.executive_summary`: coherente, menciona concept note preliminar como entregable sugerido

### Checks de aceptación

- [ ] `evidence` contiene quote con "30 de septiembre de 2026" vinculado a `deadline.date`
- [ ] `evidence` contiene quote con "USD 250.000" vinculado a `funding_amount`
- [ ] `evidence` contiene quote con "socio implementador local" vinculado a `eligibility` o `partners_needed`
- [ ] `vehicle_rationale` menciona componente satelital y/o productivo
- [ ] `draft_outputs` incluye referencia a concept note (primera etapa del proceso)
- [ ] `missing_data` vacío o solo menciona datos secundarios (url, alias de programa, etc.) — NO debe marcar deadline o monto como faltante

---

## fontagro-ganaderia

**Fixture:** `fixtures/fontagro-ganaderia.txt` — FONTAGRO Ganadería Regenerativa 2026, subvención no reembolsable, hasta USD 400.000, cierre propuesta completa 28 de febrero de 2027 (carta de interés 15 de enero de 2027).

### Campos críticos que el agente DEBE extraer con evidencia

- `classification.category`: `financiacion_no_reembolsable`
- `classification.themes`: incluye ganadería regenerativa, sistemas silvopastoriles, reducción de carbono, biodiversidad, innovación agropecuaria
- `deadline.date`: `2027-02-28` (fecha de propuesta completa), `deadline.verified: true`
- `funding_amount.value`: `400000`, `funding_amount.currency`: `USD`, `funding_amount.confirmed: true`
- `eligibility.eligible_entities`: instituciones de investigación, universidades, organizaciones del sector ganadero
- `recommended_vehicle`: `moollish_sat2farm` (ganadería + capa satelital de carbono/biodiversidad de Sat2Farm) o `alianza` (requiere consorcio multinacional)
- `partners_needed`: detecta necesidad de (a) país socio FONTAGRO y (b) centro de investigación acreditado (INIA, CIAT, CATIE o equivalente)
- `main_gap`: menciona ausencia de aliado de investigación acreditado y/o país socio como brecha principal

### Checks de aceptación

- [ ] `evidence` contiene quote con "país socio" o "país miembro" vinculado a `eligibility` o `partners_needed`
- [ ] `evidence` contiene quote con "centro de investigación" vinculado a `partners_needed`
- [ ] `evidence` contiene quote con "teoría de cambio" vinculado a `eligibility.required_documents` o `missing_data`
- [ ] `partners_needed` incluye al menos un entry con `ally_type` de centro de investigación y otro de país socio (o uno que cubra ambas brechas)
- [ ] `draft_outputs.narrative_angle` menciona ganadería regenerativa y/o teoría de cambio como eje narrativo

---

## div-fund-rural

**Fixture:** `fixtures/div-fund-rural.txt` — DIV Fund RFP 2026, subvención no reembolsable, USD 50.000–175.000 (Stage 1/Stage 2), cierre 15 de agosto de 2026, mínimo 200 hogares rurales directos.

### Campos críticos que el agente DEBE extraer con evidencia

- `classification.category`: `financiacion_no_reembolsable`
- `classification.themes`: incluye evidencia de impacto, costo-efectividad, smallholder, escalabilidad, pilotos rurales
- `deadline.date`: `2026-08-15`, `deadline.verified: true`
- `funding_amount.range_min`: `50000`, `funding_amount.range_max`: `175000`, `funding_amount.currency`: `USD`
  (el agente puede reportar `value: 175000` con nota de rango, o usar `range_min`/`range_max` — se acepta cualquier representación coherente del rango)
- `eligibility.eligible_entities`: incluye organizaciones sin fines de lucro, empresas sociales, cooperativas
- `recommended_vehicle`: `moollish_sat2farm` (tecnología satelital para monitoreo/trazabilidad de beneficiarios) o `moollish` (productor SmallHolder), con justificación de costo-efectividad
- `criteria_scores.probabilidad_exito` y `criteria_scores.impacto_estrategico`: scores justificados en relación a evidencia y escalabilidad
- `next_actions`: incluye acción de preparar metodología de medición (ensayo controlado o cuasi-experimental) y análisis de costo por beneficiario

### Checks de aceptación

- [ ] `evidence` contiene quote con "200 hogares" o "beneficiarios" vinculado a `eligibility` o `next_actions`
- [ ] `evidence` contiene quote con "costo por beneficiario" o "costo-efectividad" vinculado a `fit_scores` o `criteria_scores`
- [ ] `evidence` contiene quote con "15 de agosto de 2026" vinculado a `deadline`
- [ ] `vehicle_rationale` justifica capa de monitoreo/medición (satelital o digital) como habilitador de escalabilidad
- [ ] `draft_outputs.executive_summary` menciona potencial de escala y evidencia como ejes centrales

---

## minciencias-966

**Fixture:** `fixtures/minciencias-966.txt` — MINCIENCIAS Convocatoria 966, CTeI agropecuario Colombia, hasta COP 1.200.000.000, cierre 10 de octubre de 2026.

### Campos críticos que el agente DEBE extraer con evidencia

- `classification.category`: `financiacion_no_reembolsable`
- `classification.geography`: incluye `Colombia`
- `classification.themes`: incluye CTeI, agricultura de precisión, tecnología digital, alianza universidad-empresa
- `deadline.date`: `2026-10-10`, `deadline.verified: true`
- `funding_amount.value`: `1200000000`, `funding_amount.currency`: `COP`, `funding_amount.confirmed: true`
- `eligibility.eligible_entities`: grupos de investigación MINCIENCIAS, universidades acreditadas, empresas privadas con NIT
- `recommended_vehicle`: `alianza` (la convocatoria exige explícitamente alianza universidad-empresa; Moollish cumpliría el rol de empresa y necesita socio universitario)
- `partners_needed`: al menos un entry de universidad o centro de investigación con `suggested_role` metodológico/investigativo
- `evidence` mapea roles: universidad como ejecutora metodológica, empresa (Moollish) como beneficiaria de resultados

### Checks de aceptación

- [ ] `evidence` contiene quote con "alianzas universidad-empresa" vinculado a `recommended_vehicle` o `partners_needed`
- [ ] `evidence` contiene quote con "COP 1.200.000.000" o "mil doscientos millones" vinculado a `funding_amount`
- [ ] `evidence` contiene quote con indicadores CTeI (artículo indexado, apropiación social, innovación) vinculado a `eligibility.required_documents` o `next_actions`
- [ ] `partners_needed` incluye entry de universidad con `suggested_role` que mencione metodología, investigación o CvLAC
- [ ] `draft_outputs` menciona indicadores CTeI y/o mapeo de roles como parte del ángulo narrativo

---

## secop-car-ambiental

**Fixture:** `fixtures/secop-car-ambiental.txt` — CAR Cundinamarca, Licitación Pública SECOP II, monitoreo ambiental satelital, COP 1.500.000.000, cierre 5 de noviembre de 2026.

### Campos críticos que el agente DEBE extraer con evidencia

- `classification.category`: `contratacion_publica` (no es subvención; es licitación pública vía SECOP II)
- `classification.themes`: incluye monitoreo ambiental, ecosistemas, satelital, biodiversidad, humedales, páramos
- `classification.geography`: incluye `Colombia`, `Cundinamarca`
- `deadline.date`: `2026-11-05`, `deadline.verified: true`
- `funding_amount.value`: `1500000000`, `funding_amount.currency`: `COP`, `funding_amount.confirmed: true`
- `eligibility.eligible_entities`: personas jurídicas colombianas con objeto social en tecnologías ambientales o SIG
- `recommended_vehicle`: `moollish_sat2farm` (la oferta debe integrar capa satelital de Sat2Farm + capacidad tecnológica de Moollish para la plataforma de monitoreo)
- `eligibility.gaps`: detecta requisitos habilitantes a verificar: ISO 9001, estados financieros 2025, experiencia en contratos similares ≥ COP 800.000.000
- `risks`: incluye riesgo de competencia (otros proveedores de teledetección) y riesgo de requisitos habilitantes (financiero, legal)

### Checks de aceptación

- [ ] `classification.category` es `contratacion_publica` (NO `financiacion_no_reembolsable`)
- [ ] `evidence` contiene quote con "SECOP II" y/o "Licitación Pública" vinculado a `classification.category`
- [ ] `evidence` contiene quote con "COP 1.500.000.000" vinculado a `funding_amount`
- [ ] `evidence` contiene quote con "5 de noviembre de 2026" vinculado a `deadline`
- [ ] `eligibility.gaps` o `missing_data` menciona al menos uno de: ISO 9001, liquidez, experiencia habilitante, SECOP II
- [ ] `vehicle_rationale` menciona capa satelital (Sat2Farm) como componente técnico diferenciador en la oferta
- [ ] `draft_outputs.narrative_angle` sugiere posicionamiento de la oferta con diferenciador satelital y/o análisis de competencia

---

## Instrucciones para la corrida de aceptación

```bash
# Requiere OPENROUTER_API_KEY en .env o variable de entorno
for f in fixtures/*.txt; do
  echo "=== $f ==="
  pnpm analyze "$f"
  echo ""
done
```

La corrida queda **pendiente** hasta que el usuario configure `OPENROUTER_API_KEY`. Una vez disponible la key, ejecutar el loop anterior y verificar manualmente cada resultado contra los checks de aceptación de este archivo.
