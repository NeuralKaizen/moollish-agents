# Moollish Agents

## UI (Agente 1)

```bash
pnpm install
# Desarrollo de UI sin gastar LLM:
echo "NEXT_PUBLIC_USE_FIXTURE=1" >> .env.local
pnpm dev   # http://localhost:3000

# Integración real con el núcleo:
# poné OPENROUTER_API_KEY en .env.local y NEXT_PUBLIC_USE_FIXTURE=0
```

> **Nota deploy:** `NEXT_PUBLIC_USE_FIXTURE` es una variable `NEXT_PUBLIC_*` que se incrusta en el bundle en tiempo de build, por lo que cambiar su valor en Vercel requiere un redeploy (no alcanza con actualizar la env var). En producción deployar con `NEXT_PUBLIC_USE_FIXTURE=0`.
