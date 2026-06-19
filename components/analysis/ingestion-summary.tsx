import type { IngestionSummary } from '@/lib/ingest/types'

export function IngestionSummaryView({ ingestion }: { ingestion: IngestionSummary }) {
  const page = ingestion.sources.find((s) => s.type === 'page')
  const docs = ingestion.sources.filter((s) => s.type === 'pdf' || s.type === 'upload')

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm">
      {page && (
        <p>
          <span className="font-medium">Leí:</span>{' '}
          {page.url ? (
            <a href={page.url} target="_blank" rel="noreferrer" className="text-primary underline">
              {page.name}
            </a>
          ) : (
            page.name
          )}
        </p>
      )}

      {docs.length > 0 && (
        <p className="mt-1">
          <span className="font-medium">Descargué {docs.length} documento{docs.length > 1 ? 's' : ''}:</span>{' '}
          {docs.map((d) => d.name).join(' · ')}
        </p>
      )}

      {ingestion.truncated && (
        <p className="mt-2 text-muted-foreground">
          ⚠️ Contenido extenso: analicé los primeros caracteres de cada documento.
        </p>
      )}

      {ingestion.notes.map((note, i) => (
        <p key={i} className="mt-1 text-muted-foreground">⚠️ {note}</p>
      ))}
    </div>
  )
}
