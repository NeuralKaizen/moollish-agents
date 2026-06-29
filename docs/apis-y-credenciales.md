# APIs y credenciales externas — Agente 1

> Doc vivo: lista de servicios/credenciales externos que el Agente 1 necesita, para
> coordinar con Moollish/el cliente. Se actualiza a medida que se diseñan las features.
> Última actualización: 2026-06-29.

## Ya en uso
- **OpenRouter** (`OPENROUTER_API_KEY`) — acceso al LLM (análisis + visión). ✅ cargado.
- **Supabase Postgres** (`DATABASE_URL`) — base de datos (oportunidades, financiadores). ✅ cargado.
- **Firecrawl** (`FIRECRAWL_API_KEY`) — scraping de URLs de convocatorias. (Opcional; sin él, el seguir-enlace de capturas degrada.)

## Pendientes de decisión / a solicitar
- **Almacenamiento de archivos** (capturas, adjuntos) — DIFERIDO hasta confirmar proveedor
  (Supabase Storage vs S3 vs Cloudflare R2). Necesario para retener la imagen de las capturas
  (§8) y los adjuntos de correo (§8). Credenciales según proveedor.
- **Correo reenviado (Gmail connector, §8/§16)** — EN DISEÑO. Auth elegido: **Gmail API + OAuth**. A solicitar al cliente/Moollish:
  - **Casilla Gmail dedicada** (ej. `oportunidades@…`) a la que Alex reenvía. (¿existe o se crea? — confirmar)
  - **Proyecto en Google Cloud** con la **Gmail API habilitada**.
  - **OAuth client** (id + secret) → `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
  - **Refresh token** de la casilla dedicada (consentimiento una sola vez, scope **`gmail.readonly`** — solo lectura) → `GMAIL_REFRESH_TOKEN`.
  - (Descartados: IMAP+app password; service account/Workspace.)
  - Interno (lo generamos nosotros): `CRON_SECRET` para proteger el endpoint de cron.
  - Lib: `googleapis` (cliente oficial de Google).

## Más adelante (roadmap)
- WhatsApp Business / Instagram (webhooks de Meta) — §16.
- SECOP / Datos Abiertos (Colombia), EU Funding&Tenders, Grants.gov, UNGM, World Bank — §5/§16.
- Notion/Airtable/HubSpot, Make/n8n, Drive/SharePoint — §16.
- Proveedor de embeddings (para RAG/pgvector) — cuando haya corpus. OpenRouter no garantiza embeddings → probablemente OpenAI u otro.
