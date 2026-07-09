# Zonai Codex — TOTK Tracker / Save Editor / Companion
### Plano completo de implementação
*(nome definido: **Zonai Codex** ✅ — umbrella multi-jogos futuro: "Hyrule Codex")*

> Tracker de 100% de Tears of the Kingdom + mapa interativo + import/export/edição de save + assistente de IA que planeja seus próximos passos e desenha rotas no mapa. Identidade visual Zonai, dark mode default, EN default com toggle PT-BR, mobile-first (pra usar **enquanto joga**). Local-first, BYOK, custo zero de operação. Foco 100% em TOTK; central multi-jogos Zelda é extensão futura.

---

## 1. Decisões estratégicas

### 1.1 Nicho e concorrência

| Ferramenta existente | O que faz | O que falta vs. Zonai Codex |
|---|---|---|
| **Zelda Dungeon / IGN interactive maps** | Mapa com checkmarks manuais | Sem save import (checar 1000 koroks na mão é tortura), sem editor, sem métricas ponderadas, UX desktop-first |
| **marcrobledo/savegame-editors (TOTK)** | Editor de save web (rupees, itens, etc.) | Só editor — sem tracker, sem mapa, sem progresso, UX utilitária |
| **objmap / zeldamods tools** | Mapa técnico de objetos do jogo | Ferramenta de datamining, não de acompanhamento; intimidadora pra jogador comum |
| **Planilhas 100% da comunidade** | Checklist completo | Manual, sem mapa, sem mobile, sem save sync |
| **[TOTK-100-live-map](https://github.com/master3243/TOTK-100-live-map)** (MIT) | Mapa live com save import, 23 categorias + 16 stats | Sem editor, sem tracker manual (só save), sem IA, sem PT-BR, UI utilitária desktop; **é nossa principal fonte de dados** (dataset MIT reaproveitado com atribuição) |

**Nicho**: ninguém junta **tracker + mapa + save sync automático + editor + companion de IA** num app só, mobile-first e bilíngue. O save import é o diferencial matador: importa o `progress.sav` e o app marca sozinho tudo que você já fez — zero entrada manual pra começar.

**Portfólio**: demonstra parsing binário no browser, data pipeline grande (milhares de entidades georreferenciadas), mapa tile-based, PWA offline, integração LLM com output estruturado. Bem acima da média.

### 1.2 Arquitetura: **100% client-side, local-first, BYOK** ✅

Mesmo modelo do Mythquill (reaproveitar padrões e código dos adaptadores de IA):
- **Site estático** (deploy Vercel, padrão `*-suite.vercel.app` ou domínio próprio depois).
- **Save parsing no browser** (File API + ArrayBuffer) — o save do usuário **nunca sai do dispositivo dele**. Zero responsabilidade, zero custo.
- **Progresso em IndexedDB** (Dexie) + export/import JSON do estado do tracker (backup/troca de dispositivo).
- **IA BYOK**: Gemini free tier como default recomendado, OpenRouter/local via adaptador OpenAI-compatible. Sem chave, o planner determinístico local ainda funciona (ver §8).

### 1.3 Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Framework | **Vite + React + TS** ✅ (decidido 2026-07-09) | App é ferramenta interativa local-first — SPA pura casa perfeito; SEO irrelevante (tráfego vem de Reddit/boca-a-boca); reaproveita o esqueleto do Mythquill; Leaflet/PWA sem fricção de SSR |
| Estado | **Zustand** + Dexie (IndexedDB) | Simples, já conhecido |
| Mapa | **Leaflet** com `CRS.Simple` + pirâmide de tiles (3 camadas: Céu / Superfície / Profundezas) | Padrão da indústria pra mapas de jogo; leve no mobile |
| UI | Tailwind + componentes próprios (identidade Zonai não combina com shadcn cru) | Controle total do visual |
| i18n | **next-intl** — EN default, toggle PT-BR persistido | Requisito |
| PWA | Serwist (next-pwa sucessor) — offline completo exceto IA | Requisito mobile |
| Gráficos | SVG próprio (anéis de progresso) + Recharts se precisar | Métricas visuais |
| Save parsing | Módulo próprio TS: murmur3 + dicionário de hashes | Ver §7 |

### 1.4 Copyright: **risco aceito** ✅

Decisão sua (2026-07-09): fan project não-comercial (nunca monetizado), **sem preocupação com originalidade/IP**. Isso simplifica tudo:
- **Assets do jogo liberados**: ícones oficiais (shrines, armaduras, materiais), artes, tiles do mapa hospedados por nós — o que deixar o app mais bonito e reconhecível.
- **Tiles do mapa**: hospedar direto (pirâmide de tiles das 3 camadas), como todo fan map faz.
- **Personagens literais liberados**: a companion é a **Purah** de verdade (ver §8), e o app pode se enquadrar como um "Purah Pad" real.
- Manter apenas o disclaimer padrão ("fan project, not affiliated with Nintendo") no rodapé/README.

---

## 2. Identidade visual — "Zonai"

- **Dark default** (requisito), tema "ruína Zonai à noite": fundo quase-preto esverdeado (`#0a1210`-ish), superfícies em verde-petróleo escuro.
- **Acento primário: verde-jade Zonai luminoso** (`#4ade9c` / `#2dd4a8` zone) com **glow** sutil (box-shadow/blur) — a assinatura visual das runas Zonai. Acento secundário: **dourado antigo** (`#d4b46a`) pra conquistas/100%.
  - *(Nota: verde é a identidade do Pluto na suite Olympus, mas este projeto é fora da suite e o verde Zonai é mandatório tematicamente — não conflita.)*
- **Motivos**: círculos concêntricos, espirais e traços de runa Zonai como ornamentos (SVG próprios), bordas com cantos chanfrados estilo painel de tecnologia antiga, linhas finas luminosas.
- **Light mode** (secundário): "pedra clara ao sol" — bege-pedra, jade escuro como acento.
- Tipografia: display geométrica/rúnica pra títulos (ex.: Michroma, Orbitron ou similar que evoque tech-antiga sem ser clichê sci-fi) + sans legível pro corpo (Inter). Invocar skill de frontend-design na F0 pra fechar isso.
- Micro-interações: check de item = pulso de glow verde; categoria 100% = selo dourado com animação de runa.
- **Enquadramento "Purah Pad"**: o app se apresenta como o próprio Purah Pad — bottom nav como abas do Pad, ícones oficiais do jogo liberados (§1.4). Reforça a imersão sem custo extra de design.

---

## 3. Modelo de dados e o "100%"

### 3.1 Datasets estáticos (JSON versionados no repo)

**✅ RESOLVIDO (2026-07-09)**: dataset completo obtido do TOTK-100-live-map (MIT) — `reference/totk-100-live-map/docs/completion_data.json`: **23 categorias de markers (~3.140 itens com hash + coordenadas x/y/z + camada)** e **16 categorias de stats**. Dicionário completo de hashes (1.7MB) do savegame-editors (MIT). Detalhes do formato do save e semântica de avaliação: `reference/NOTES.md`.

Contagens REAIS do dataset (substituem as estimativas anteriores):

**Markers (com coordenadas → mapa)**: towers 15, shrines 152, shrine chests 166, lightroots 120, caves 197, bubbulfrogs 147, hudson signs 81, dungeon bosses 12, flux constructs 35, hinox 69, stone talus 87, molduga 4, frox 40, gleeok 14, wells 58, chasms 36, koroks 900 (= 1.000 sementes, carry vale 2), schema stones 12, yiga schematics 34, old maps 62, armor chests 85, sage's wills 20, general locations 794.

**Stats (sem coordenadas)**: compendium 509, armor inventory 136, armor 4★ 104, pristine weapons 33, fabrics 29, fabrics amiibo 29, recipes 228, materials 251, key items 38, main quests 21, side quests 139, side adventures 60, shrine quests 31, memories 18, character profiles 22, zonai devices 27. Mais: corações 40, stamina 3 rodas, bateria 48 células, rupees.

Cada entidade no nosso schema: `id` canônico, nome EN/PT, categoria, região, coordenadas, hash(es), metadados.

Tabelas de planejamento originais (mantidas como referência da ponderação Tier A/B/C):

**Tier A — conta no Map % (o contador de mapa do próprio jogo)**
| Categoria | Qtd |
|---|---|
| Shrines | 152 |
| Lightroots (Profundezas) | 120 |
| Skyview Towers | 15 |
| Wells | 58 |
| Cave entrances | 147 |
| Chasms | 35 ⚠️ |
| Zonai Device Dispensers | 30 ⚠️ |
| Named locations (florestas, pontes, lagos, minas, settlements, stables, lojas, forjas…) | ~centenas ⚠️ (maior peso do map %) |

**Tier B — não conta no map %, mas é obrigatório pro "True 100%"**
| Categoria | Qtd |
|---|---|
| Korok seeds | 1.000 (900 + 100 de transporte ⚠️ conferir split) |
| Bubbul gems | 147 (1 por caverna) |
| Main quests | 23 ⚠️ |
| Side Adventures | 60 |
| Side Quests | 139 ⚠️ (varia com versão do jogo) |
| Memories | 18 (12 Dragon Tears + 6 história) |
| Armaduras: coletar todas + upgrade 4★ | ~228 peças ⚠️ |
| Compendium (Purah Pad) | 509 entradas ⚠️ |
| Key items: Schema Stones | 12 |
| Key items: Yiga Schematics | 34 |
| Key items: Old Maps | 31 ⚠️ |
| Key items: Sage's Wills | 20 |
| Key items: Ancient Tablets | 13 ⚠️ |
| Upgrades: inventário completo (Hestu), Energy Well/bateria máx, Sage's Vows | — |

**Tier C — trackeável mas NÃO entra em nenhum %** (métricas informativas):
Rupees, materiais, armas/escudos/arcos (perecíveis), cavalos, coletáveis de Amiibo (armaduras amiibo entram no Tier B se o usuário ativar a opção — ver 3.2), medalhas de monstro, receitas.

### 3.2 As métricas (requisito central)

- **Map %** — réplica fiel do contador do jogo (Tier A). Meta: bater com o número que o jogador vê in-game.
- **True 100%** — Tier A + Tier B ponderados. Peso default: cada item = 1 unidade dentro da categoria, cada categoria normalizada (pra 1.000 koroks não esmagarem 15 torres). Dashboard mostra o anel geral + anel por categoria.
- **Configurável**: toggles "o que entra no meu 100%" (ex.: incluir/excluir amiibo-exclusivos, upgrades 4★, compendium) — a comunidade diverge nisso, o app não impõe.
- Cada categoria tem página própria com progresso individual, filtros (região/status) e busca.

---

## 3.5 Modelo UX: tracker × editor de save (decisão 2026-07-09)

**Uma checklist só, papéis distintos — nunca duas tabelas.**

- **Tracker** = a intenção/estado do jogador. Cada item é "feito" se veio do save importado (badge `sav`) **ou** foi marcado manualmente. Marcar/desmarcar no tracker NUNCA mexe no save.
- **Editor (F4)** = operação explícita na área **Save**, modelada como *staged changes* (mentalidade git): o app calcula a diferença tracker ↔ save carregado e apresenta como mudanças propostas ("você marcou 3 shrines que não estão no save — escrever no arquivo?"); o usuário seleciona o que aplicar, vê o **diff final** e exporta. Edições diretas (rupees, quantidades) também entram no mesmo staging.
- **Import com save já carregado** = mostra **diff estilo git** por item: `+` conquistas novas, `−` regressões (save mais antigo), deltas de player (rupees/corações/stamina/bateria). Sem save anterior, sem diff (tudo seria "+").
- **i18n de conteúdo**: nomes próprios do jogo (shrines, itens, locais) ficam em inglês — sem caça à localização oficial da Nintendo; só a UI é traduzida.

## 4. Tracker (F2)

- Dashboard: anel geral True 100% + Map % + grid de anéis por categoria + "recentes" + streak opcional.
- Página por categoria: lista virtual (1.000 koroks!), check rápido (tap na linha inteira no mobile), filtro por região/camada/status, busca, bulk check por região.
- Tudo espelhado no mapa (badge "ver no mapa" em cada item).
- Undo imediato pós-check (evitar miss-tap jogando).

## 5. Mobile / PWA (F0 + contínuo)

- **Cenário de uso primário: celular na mão, Switch na outra.** Bottom nav (Dashboard / Tracker / Mapa / Companion / Save), alvos de toque grandes, dark pra não ofuscar.
- PWA instalável, 100% offline (datasets e tiles em cache; IA é a única coisa online).
- **Modo "jogando agora"**: tela rápida — escolhe a região onde você está e vê só o que falta ali, ordenado por proximidade.

## 6. Mapa interativo (F3)

- 3 camadas: **Céu / Superfície / Profundezas** com switch rápido (e sincronia de posição entre camadas, como no jogo).
- Markers por categoria com estado (feito = jade preenchido, pendente = outline), filtros por categoria, clustering em zoom-out.
- Fonte de coordenadas: datasets da comunidade/datamining (zeldamods e afins) — pipeline na F1 normaliza tudo pro nosso schema.
- Tap no marker → card do item (nome EN/PT, categoria, check direto ali, link pra categoria).
- Rotas do Companion desenhadas por cima (polyline + markers numerados) — ver §8.

## 7. Save import / export / editor (F4 — módulo de maior risco técnico)

**Formato ✅ decifrado e validado** (detalhes em `reference/NOTES.md`): magic `0x01020304`, tabela de pares `(murmur3_32, valor)` a partir de `0x28`, ponteiros pra tipos compostos, array de GUIDs no final. Sem checksum — edição direta viável. Versões suportadas: v1.0 / v1.1–1.2 / v1.4 (detectadas por tamanho do arquivo). **Fixture de teste**: `fixtures/umar-save/` (save ~100% real, v1.1/1.2) — é a métrica de qualidade do import: carregar ele tem que mostrar ~100% em tudo.

- **Import** (o recurso matador): upload do `progress.sav` → parse client-side → auto-marca tudo no tracker (shrines, koroks, quests, armaduras, compendium, key items…). Também lê rupees, bateria, corações/stamina.
- **Export/edição**: editar rupees, quantidades de materiais, armaduras (posse + nível de upgrade), key items, coletáveis amiibo, flags de progresso trackeadas → gera `progress.sav` modificado pra download.
- **Segurança**: backup automático do arquivo original antes de qualquer edição (mantido no IndexedDB + download forçado), validação de versão, diff "o que será alterado" antes de exportar, aviso claro de riscos.
- **Escopo honesto**: editar *o que é trackeado* + itens/rupees/amiibo. Não é um editor genérico de todas as flags do jogo (isso é rabbit hole infinito — fica pra extensão).
- Requer o save do Switch (usuário extrai via homebrew/JKSV — documentar isso com guia neutro, sem hospedar nada de homebrew).

## 8. Companion de IA (F5)

**Persona**: **Purah** — é a escolha óbvia agora que IP não é preocupação: cientista, dona do Purah Pad, arquétipo perfeito de "pesquisadora que analisa seu progresso e planeja a expedição". Tom animado/nerd fiel ao jogo, responde no idioma ativo. Extensão futura: seletor de personas (Zelda, Rauru, um Steward Construct…) — só troca o system prompt e o avatar.

**Arquitetura híbrida — planner determinístico + LLM por cima**:
1. **Planner local (sem IA, sempre funciona)**: lê o estado do tracker → calcula "o que falta perto de onde você está", agrupa por região, ordena por densidade/proximidade → gera um plano estruturado (JSON: passos, itens-alvo com coords, ordem).
2. **LLM (BYOK, opcional)**: recebe o estado resumido + plano candidato → refina prioridade (ex.: "faça essas 2 shrines antes porque destravam a torre que revela os koroks da área"), escreve o plano em linguagem natural com a persona, sugere metas de sessão ("hoje: fechar Hebra").
3. **Output estruturado** (JSON schema): o app renderiza como **flow visual** (stepper vertical com cards por passo) **e desenha no mapa** (markers numerados + polyline da rota, camada própria togglável).

Adaptadores de IA: **reaproveitar do Mythquill** (Gemini + OpenAI-compatible). Sem streaming necessário aqui — resposta única estruturada (tool use / JSON mode).

## 9. i18n

- **EN default, toggle PT-BR** (requisito), persistido em localStorage, chave no header.
- Nomes de entidades nos dois idiomas no dataset (tradução oficial PT-BR do jogo existe — fonte: datamining de texto da comunidade ⚠️ validar na F1).
- UI strings via next-intl. Persona da IA responde no idioma ativo.

---

## 10. Fases

### F0 — Fundação e identidade ✦ (CONCLUÍDA 2026-07-09, exceto deploy)
- [x] Scaffold: Vite + React + TS + Tailwind v4 + Zustand (persist) + react-i18next + vite-plugin-pwa (`app/`)
- [x] Design system Zonai: tokens dark/light ("ruína Zonai à noite" / "pedra ao sol"), Marcellus + IBM Plex Sans/Mono, painéis chanfrados, ZonaiRing (anel de ticks com glow, dourado no 100%), HUD bar (corações/stamina/bateria/rupees)
- [x] Layout mobile-first com as 5 áreas (Dashboard / Tracker / Mapa / Companion / Save) + toggles EN↔PT e tema
- [ ] Deploy Vercel

### F1 — Pipeline de dados (a fase invisível que define tudo)
- [x] Pesquisa: fontes de datasets e dicionários de hash — **TOTK-100-live-map (MIT) + savegame-editors (MIT)**, clonados em `reference/` (2026-07-09)
- [x] Spike do formato do save: parser validado contra o fixture ~100% (`scripts/spike-parse-save.mjs` — todas as 23 categorias corretas, murmur3 conferido) (2026-07-09)
- [ ] Schema canônico das entidades + script de normalização (gerar os JSONs do app a partir do completion_data.json + nomes PT-BR)
- [ ] Nomes PT-BR das entidades (tradução oficial do jogo — fonte comunitária a localizar)
- [ ] Obter/gerar a pirâmide de tiles das 3 camadas (fontes comunitárias; hospedamos nós mesmos, §1.4)
- [ ] Parse do pouch (inventário) pra stats de materials/key items/armor level (portar do savegame-editors)

### F2 — Tracker + métricas
- [x] Páginas de categoria com check manual (pulso de runa), filtros feito/pendente, busca, badge "sav" pra itens detectados do save (2026-07-09)
- [x] Dashboard: True 100% (média normalizada) + anéis por categoria/stat (2026-07-09)
- [ ] Map % (réplica do contador do jogo) como métrica separada
- [ ] Bulk check por região + agrupamento por região
- [ ] Configuração "o que entra no meu 100%"
- [ ] Export/import JSON do progresso
- [ ] Migrar persistência de localStorage pra Dexie/IndexedDB se o estado crescer

### F3 — Mapa
- [ ] Leaflet CRS.Simple, 3 camadas, markers com estado, filtros, clustering
- [ ] Sync bidirecional tracker ↔ mapa
- [ ] Modo "jogando agora" (região atual → o que falta perto)

### F4 — Save
- [x] Parser do progress.sav em TS (`app/src/lib/saveParser.ts`) — validado contra o save ~100% no app (4.270 itens detectados, números idênticos ao spike) (2026-07-09)
- [x] Import → auto-check do tracker + botão "Load demo save" (fixture em `app/public/demo/`) (2026-07-09)
- [ ] Parse do pouch: materials 251 / key items 38 / armor 136 / armor 4★ 104 (hoje aparecem 0 do save — só manual)
- [ ] Serializer/editor (rupees, itens, armaduras+upgrades, key items, amiibo, flags trackeadas) com diff + backup + export

### F5 — Companion IA
- [ ] Planner determinístico local (próximos passos por proximidade/densidade)
- [ ] Adaptadores BYOK (port do Mythquill) + persona Purah + JSON estruturado
- [ ] Flow visual (stepper) + desenho da rota no mapa

### F6 — Polish e lançamento
- [ ] Passe de identidade visual completo, animações, empty states
- [ ] Guia de extração de save, créditos/disclaimers, README bilíngue
- [ ] Performance mobile (1.000 koroks no mapa), Lighthouse PWA
- [ ] Divulgação (r/TOTK, r/zelda — feedback da comunidade)

### Extensões futuras (fora de escopo agora)
- Central multi-jogos "Hyrule Codex" (BOTW primeiro — mesma engine de save/mapa muda pouco)
- Editor avançado de flags arbitrárias; editor de equipamento (armas/modifiers)
- Compartilhar progresso (imagem/link read-only)
- Mapa vetorial estilizado próprio (opção puramente estética, estilo "mapa Zonai desenhado")

---

## 11. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Takedown Nintendo | Risco aceito (decisão de 2026-07-09) | Sem monetização + disclaimer; se um dia vier C&D, acata e pronto — nada a perder |
| Dicionário de hashes incompleto/versões de save | Save sync parcial | Spike na F1 antes de prometer; degradar graciosamente (importa o que reconhece + relatório) |
| Volume de dados (coords de ~3.000+ entidades) | Atraso na F1 | Pipeline scriptado, não manual; priorizar categorias Tier A primeiro |
| Escopo (é grande) | Projeto eterno | Cada fase entrega algo usável; F2 já é um produto (tracker manual) mesmo sem F3-F5 |

## 12. Estrutura

```
zonai-codex/
├── PLANO.md            ← este arquivo (checkboxes atualizados junto com o código)
├── data/               ← JSONs canônicos gerados (entidades, i18n de nomes, hashes)
├── scripts/            ← pipeline de normalização dos datasets
└── app/                ← o app (criado na F0)
```
