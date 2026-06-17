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
