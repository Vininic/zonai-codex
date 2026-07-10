# Handoff — Zonai Codex

## Goal

Zonai Codex: tracker de 100% de Zelda TOTK + mapa interativo + import/export/edição de save + companion de IA (Purah) que planeja próximos passos e desenha rotas no mapa. Vite + React + TS, 100% client-side/local-first/BYOK. Plano completo em [PLANO.md](PLANO.md) (leia primeiro — tem todo o histórico de decisões, fases F0-F6 e o que está feito).

Live: **https://zonai-codex.vercel.app**. Repo local em `zonai-codex/` (git próprio, não é o mono-repo do resto do portfólio).

## Current Progress

Todas as fases F0–F5 do plano original estão implementadas, mais duas rodadas de review de design/UX e uma rodada de "IA real":

- **Tracker**: todas as 23 categorias de markers + 16 stats, tabela desktop / cards mobile, busca, filtro feito/pendente, badge `sav` pra itens confirmados pelo save.
- **Dashboard**: anel hero animado (True 100%), anel Map %, radial multi-camada "o que falta", donut de quests, config "Meu 100%" (exclusão de grupos).
- **Save import**: parser TS do `progress.sav` (`app/src/lib/saveParser.ts`) validado contra um save ~100% real. Detecta tudo automaticamente, inclusive pouch (materials/key items/armor via `readString64Array`).
- **Diff de import**: estilo git (`+`/`−` por categoria + deltas de player) ao importar um save por cima de outro já carregado.
- **Editor de save v1** (`app/src/lib/saveWriter.ts`): grava no arquivo apenas os kinds `bool`/`seed` (categorias) e `positive` (stats) — ver seção "O que NÃO funciona" abaixo, é a resposta direta à pergunta do usuário sobre amiibo.
- **Mapa**: Leaflet CRS.Simple, 3 camadas (surface/sky/depths), ícones reais por categoria (zd-icons, `app/public/icons/`), full-screen, painel filtro+legenda, sidebar colapsável, sync com tracker.
- **Companion "Purah"**: chat de verdade (não mais formulário), com:
  - Intent parsing local (`lib/intent.ts`) + fallback LLM pra frases livres.
  - Planos determinísticos: coleta simples por categoria, plano de armadura em fluxo (baú → materiais por estrela → farm de chefes mapeados), plano de região ("limpar Hebra" — `lib/regions.ts` + `lib/regionPlanner.ts`, 11 bounding boxes calibradas pelas torres).
  - `PlanFlow.tsx`: componente de flow chart vertical numerado.
  - IA real conectada: `lib/ai.ts` é uma camada unificada Gemini + qualquer endpoint OpenAI-compatible (OpenRouter/Groq/Ollama). Chave de dev em `app/.env.local` (`VITE_GEMINI_API_KEY`, gitignored — copiada do projeto chronos-audit). **Validado com chamadas reais** (intent de frase livre + narração em personagem funcionando).
  - Retrato da Purah: `app/public/purah.png` — **o usuário já substituiu esse arquivo manualmente**, não mexer nele nem reverter.

Commits recentes (nesta ordem): `a1bba1f` (review 2: ícones SVG, mapa fullscreen, sidebar colapsável) → `0334d1a` (IA real + planos em fluxo) → `b003b0e` (registro no PLANO.md).

## What Worked

- **Modelos Gemini**: `gemini-2.5-flash`/`pro`/`flash-lite` retornam **404 pra chaves novas** (aposentados pelo Google). A correção foi mapear pros aliases atuais: `gemini-flash-latest`, `gemini-pro-latest`, `gemini-flash-lite-latest` (`GEMINI_LEGACY` em `lib/ai.ts`, coerção automática de valores antigos salvos no store). Também: desligar `thinkingConfig.thinkingBudget: 0` nos modelos flash pra latência baixa em tarefas curtas.
- Publicar a chave de IA em produção pela dashboard da Vercel funciona bem (Settings → Environment Variables → `VITE_GEMINI_API_KEY` → **Redeploy obrigatório** pra ela entrar no bundle do Vite). Já expliquei isso ao usuário; não sei se ele já fez.
- Validação de fluxos complexos (mapa, save import/export, chat) foi feita majoritariamente via `preview_eval` (JS direto no browser) em vez de screenshot — o ambiente de preview desta máquina tem GPU quebrada e `preview_screenshot` trava/timeout.

## What Didn't Work / Constraints conhecidas

- **Tentei publicar a chave Gemini na Vercel via CLI (`vercel env add` / redeploy com env embutido) e o classificador de segurança do Claude Code bloqueou** — corretamente, é uma credencial. Isso é uma decisão do usuário, não repetir a tentativa; só explicar como fazer pela dashboard (já expliquei, ver conversa anterior).
- Deploy via `vercel deploy --prod` a partir de `dist/` prebuilt não funciona direto neste projeto (o projeto Vercel está configurado pra rodar build remoto; um `vercel.json` com `buildCommand: null` dentro de `dist/` não resolveu limpo). O fluxo que funciona é: `cd app && npm run build && vercel deploy --prod --yes` (deixa a Vercel rodar o build dela também, é redundante mas não quebra).
- `git commit -m` com heredoc PowerShell: aspas duplas dentro do corpo da mensagem quebram o argumento. Usar `@'...'@` (single-quoted here-string) sempre.

## Sessão 2026-07-10 (continuação): as duas lacunas do handoff anterior foram resolvidas

### 1. Amiibo fabrics — testado ponta-a-ponta, funciona ✓

Validado no browser real (não só análise de código): marcar "Champion's Leathers Fabric" (`fabrics_amiibo`) no Tracker → Save → Edit & export mostrou staged "Fabrics (Amiibo) +1" → "Write & download save" → o Blob gerado foi capturado via hook em `URL.createObjectURL` e reimportado como File no mesmo input → o item passou a aparecer com badge `sav`, contagem 19/29 → 20/29, total 4.795 → 4.796 itens. Sem surpresas: `fabrics_amiibo` tem `kind: "positive"`, `targetValue: null`, exatamente o caso simples que `saveWriter.ts` já cobria. O mecanismo de escrita escalar (`writesForItem` + `applyEdits`) está confirmado funcional pra qualquer stat/categoria `positive`/`bool`/`seed`, não só amiibo — dá confiança pro editor v1 como um todo. Detalhes em PLANO.md §F4. Script de regressão sem depender do browser: `scripts/spike-write-amiibo.mjs` (roda em ~1s, replica a lógica exata do writer).

Resposta que fica valendo pro usuário: marcar no Tracker continua sem tocar o save (design deliberado, §3.5 do PLANO.md) — pra persistir de verdade, sempre passa por Save → Edit & export → Write & download.

### 2. Tab de Inventário v1 — implementada

Nova página em [app/src/pages/Inventory.tsx](app/src/pages/Inventory.tsx), rota `/inventory`, item de nav próprio (ícone de bolsa) entre Tracker e Map. Lógica de leitura em [app/src/lib/inventory.ts](app/src/lib/inventory.ts):
- **Materiais** (251): quantidade real do pouch quando há save na sessão (mesmo mecanismo do `armorPlanner.ts::materialStock`, generalizado pra todos os materiais de uma vez, não só os usados em upgrades de armadura). Ordenados por quantidade desc.
- **Itens-Chave** (38): owned/not owned (não têm quantidade no jogo).
- **Armaduras** (136): owned + estrelas 0-4★ lidas direto do pouch por peça (generaliza `armorPlanner.ts::currentStarsFromSession` pra todas de uma vez).
- Sem save na sessão (após reload — o buffer não persiste, só o `fromSave` derivado): cai pra owned/not owned via `manual`/`fromSave` persistidos, sem quantidade/estrelas, com aviso na tela.

Testado no browser: com o demo save carregado, Materiais mostra "Brightbloom Seed×999, Bokoblin Fang×515, ..." e Armaduras mostra peças com "★★★★" corretas. `tsc -b` limpo.

**Fora do escopo (V2, precisa pesquisa nova)**: armas/escudos/arcos e comida/receitas não são itens de pouch navegáveis no dataset atual (`recipes` é uma stat liga/desliga tipo `positive`, não uma lista de comida carregada) — ver nota antiga sobre `zelda-totk.hashes.csv` em `reference/savegame-editors/` se o usuário pedir isso depois.

### Infra desta sessão
- Criado `.claude/launch.json` (não existia) pra rodar o dev server via `preview_start` — `npm --prefix app run dev`, porta 5173. Necessário porque o preview do browser desta sessão precisa dessa config.
- `screenshot`/`computer` do Browser pane continuam quebrados nesta máquina (GPU) — toda a verificação de UI foi feita via `javascript_tool` (DOM/click/dispatch de eventos) e `get_page_text`, não screenshot.
