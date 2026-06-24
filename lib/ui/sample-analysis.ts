import type { OpportunityAnalysis } from '@/lib/agent/schema'

export const SAMPLE_ANALYSIS: OpportunityAnalysis = {
  opportunity_id: 'sample-fao-agrinno',
  source: {
    name: 'FAO — AgrInno: Innovación agroalimentaria en América Latina',
    url: 'https://www.fao.org/agrinno',
    channel: 'web',
    confidence_level: 'alta',
  },
  classification: {
    category: 'financiacion_no_reembolsable',
    subcategory: 'Innovación agroalimentaria',
    instrument: 'Subvención (grant) con cofinanciación',
    themes: ['agro-tecnología', 'agricultura de precisión', 'seguridad alimentaria'],
    geography: ['Colombia', 'América Latina'],
  },
  deadline: {
    date: '2026-07-30T23:59:00.000Z',
    verified: false,
    days_remaining: 43,
  },
  funding_amount: {
    value: 500000,
    currency: 'USD',
    confirmed: true,
    estimated_cop: 2050000000,
    estimated_usd: 500000,
    range_min: null,
    range_max: null,
  },
  eligibility: {
    eligible_entities: ['Pymes agro-tecnológicas', 'Centros de investigación', 'Consorcios público-privados'],
    countries: ['Colombia', 'México', 'Perú', 'Ecuador'],
    restrictions: ['Requiere al menos un socio en otro país elegible'],
    required_documents: ['Concept note (5 págs.)', 'Carta de socios', 'Presupuesto preliminar'],
    gaps: ['Falta confirmar socio internacional elegible'],
  },
  recommended_vehicle: 'moollish_sat2farm',
  vehicle_rationale:
    'La convocatoria premia soluciones agro-tecnológicas con componente satelital y de precisión; Moollish aporta el negocio productivo y Sat2Farm la capa de datos satelitales/carbono.',
  criteria_scores: {
    alineacion_estrategica: { score: 92, justification: 'Encaje directo con agro-tech y agricultura de precisión, core de Moollish + Sat2Farm.' },
    elegibilidad: { score: 80, justification: 'Entidad elegible como pyme agro-tech; pendiente sumar socio internacional.' },
    monto_retorno: { score: 85, justification: 'USD 500k no reembolsables, retorno alto frente al esfuerzo.' },
    probabilidad_exito: { score: 70, justification: 'Competencia internacional fuerte; el componente satelital diferencia.' },
    complejidad_documental: { score: 75, justification: 'Concept note + cartas de socio; alcanzable en plazo.' },
    tiempo_disponible: { score: 78, justification: 'Cierre 30/jul: margen ajustado pero suficiente.' },
    impacto_estrategico: { score: 88, justification: 'Abre puerta a red FAO y a futuras convocatorias multilaterales.' },
    riesgo_ejecucion: { score: 60, justification: 'Riesgo medio por coordinación con socio externo aún no asegurado.' },
  },
  institutional_fit: {
    moollish: 92,
    sat2farm: 88,
    foundation_nova: 45,
    alliance: 80,
  },
  effort: 'medio',
  risk: 'medio',
  main_gap: 'Conseguir un socio internacional elegible (centro de investigación o pyme en otro país de la lista).',
  partners_needed: [
    {
      gap: 'Socio internacional elegible',
      ally_type: 'Centro de investigación agropecuaria',
      suggested_role: 'Co-aplicante en país elegible',
      priority: 'alto',
      reason: 'La convocatoria exige al menos un socio en otro país de la lista.',
    },
  ],
  risks: [
    { type: 'tiempo', description: 'Plazo de cierre ajustado para coordinar socios.', severity: 'medio' },
    { type: 'ejecucion', description: 'Dependencia de un socio externo aún no confirmado.', severity: 'medio' },
  ],
  next_actions: [
    { action: 'Verificar la fecha de cierre en el portal oficial de FAO.', responsible: 'Funding', due_date: '2026-06-18T00:00:00.000Z', dependency: null },
    { action: 'Contactar centro de investigación aliado en México o Perú.', responsible: 'Partnerships', due_date: '2026-06-19T00:00:00.000Z', dependency: 'Lista corta de aliados' },
    { action: 'Redactar borrador de concept note preliminar.', responsible: 'Funding', due_date: '2026-06-20T00:00:00.000Z', dependency: null },
  ],
  evidence: [
    { claim: 'Fecha de cierre 30 de julio de 2026', quote: '"…las propuestas se recibirán hasta el 30 de julio de 2026 a las 23:59 (GMT)."', field: 'deadline.date' },
    { claim: 'Monto de hasta USD 500.000', quote: '"…subvenciones de hasta USD 500,000 por proyecto…"', field: 'funding_amount.value' },
    { claim: 'Requiere socio en otro país elegible', quote: '"…cada propuesta debe incluir al menos un socio establecido en otro país elegible…"', field: 'eligibility.restrictions' },
  ],
  missing_data: ['Monto exacto del cofinanciamiento requerido al aplicante'],
  draft_outputs: {
    executive_summary:
      'FAO AgrInno ofrece hasta USD 500k no reembolsables para innovación agroalimentaria en América Latina. Encaje alto con Moollish + Sat2Farm por el componente de agricultura de precisión y datos satelitales. La principal brecha es sumar un socio internacional elegible antes del cierre del 30 de julio.',
    narrative_angle:
      'Posicionar a Moollish + Sat2Farm como una solución probada de agricultura de precisión con impacto medible en pequeños productores, lista para escalar regionalmente con respaldo de FAO.',
  },
  overall_score: 87,
  semaforo: 'verde_alto',
  recommendation: 'apply_now',
  analysis_meta: {
    model: 'anthropic/claude-sonnet-4.5',
    weights_version: 'v1',
    analyzed_at: '2026-06-17T12:00:00.000Z',
  },
}
