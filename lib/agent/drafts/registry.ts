import { z } from 'zod'

export interface DraftSection { key: string; label: string }
export interface DraftKind { kind: string; label: string; sections: DraftSection[] }

export const DRAFT_KINDS: DraftKind[] = [
  {
    kind: 'concept_note', label: 'Concept Note',
    sections: [
      { key: 'problema', label: 'Problema' },
      { key: 'solucion', label: 'Solución' },
      { key: 'beneficiarios', label: 'Beneficiarios' },
      { key: 'innovacion', label: 'Innovación' },
      { key: 'resultados', label: 'Resultados' },
      { key: 'presupuesto_marco', label: 'Presupuesto marco' },
    ],
  },
  {
    kind: 'teoria_cambio', label: 'Teoría de Cambio',
    sections: [
      { key: 'problema', label: 'Problema' },
      { key: 'insumos', label: 'Insumos' },
      { key: 'actividades', label: 'Actividades' },
      { key: 'productos', label: 'Productos' },
      { key: 'resultados', label: 'Resultados' },
      { key: 'impacto', label: 'Impacto' },
      { key: 'supuestos', label: 'Supuestos' },
    ],
  },
  {
    kind: 'marco_logico', label: 'Marco Lógico',
    sections: [
      { key: 'fin', label: 'Fin' },
      { key: 'proposito', label: 'Propósito' },
      { key: 'componentes', label: 'Componentes' },
      { key: 'actividades', label: 'Actividades' },
      { key: 'indicadores', label: 'Indicadores' },
      { key: 'medios_verificacion', label: 'Medios de verificación' },
      { key: 'supuestos', label: 'Supuestos' },
    ],
  },
  {
    kind: 'presupuesto', label: 'Presupuesto preliminar',
    sections: [
      { key: 'categorias', label: 'Categorías' },
      { key: 'costos_unitarios', label: 'Costos unitarios' },
      { key: 'contrapartida', label: 'Contrapartida' },
      { key: 'fee', label: 'Fee' },
      { key: 'tecnologia', label: 'Tecnología' },
      { key: 'personal', label: 'Personal' },
      { key: 'operacion', label: 'Operación' },
    ],
  },
  {
    kind: 'cronograma', label: 'Cronograma',
    sections: [
      { key: 'fases', label: 'Fases' },
      { key: 'hitos', label: 'Hitos' },
      { key: 'responsables', label: 'Responsables' },
      { key: 'fecha_limite', label: 'Fecha límite' },
      { key: 'ruta_critica', label: 'Ruta crítica' },
    ],
  },
  {
    kind: 'matriz_riesgos', label: 'Matriz de Riesgos',
    sections: [
      { key: 'riesgos_tecnicos', label: 'Riesgos técnicos' },
      { key: 'riesgos_financieros', label: 'Riesgos financieros' },
      { key: 'riesgos_sociales', label: 'Riesgos sociales' },
      { key: 'riesgos_legales', label: 'Riesgos legales' },
      { key: 'riesgos_ambientales', label: 'Riesgos ambientales' },
      { key: 'mitigaciones', label: 'Mitigaciones' },
    ],
  },
]

export function getDraftKind(kind: string): DraftKind | undefined {
  return DRAFT_KINDS.find((k) => k.kind === kind)
}

export function buildKindSchema(kind: string): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const dk = getDraftKind(kind)
  if (!dk) throw new Error(`Tipo de borrador desconocido: ${kind}`)
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const s of dk.sections) shape[s.key] = z.string().describe(s.label)
  shape.missing_data = z.array(z.string()).describe('Datos ausentes en la fuente necesarios para completar el entregable.')
  return z.object(shape)
}
