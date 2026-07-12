# Zonai Codex

**Tears of the Kingdom 100% tracker, save importer/editor & AI companion.** Mobile-first PWA, local-first — your save never leaves your device.

🔗 **Live**: [zonai-codex.vercel.app](https://zonai-codex.vercel.app)

*[Leia em português abaixo](#-zonai-codex-pt-br)*

## Features

- 📊 Tracker for all 23 map-marker categories (~3,140 items) plus 16 collections/quest lists, with a dashboard (True 100% ring, map %, per-category breakdown).
- 💾 Import your `progress.sav` and auto-check everything the game already tracks — full parse runs in your browser. See [docs/SAVE_GUIDE.md](docs/SAVE_GUIDE.md) for how to get the file off your Switch.
- ✏️ Save editor: stage manual Tracker checks and write them back into a new `.sav` file, with a git-style diff of what changed.
- 🎒 Inventory tab: materials with real quantities, key items, and armor with star levels — all read live from your imported save.
- 🗺️ Interactive map (Leaflet) across surface/sky/depths layers, synced with the Tracker.
- 🧭 "Purah" companion: ask for a route to remaining koroks/shrines/etc., an armor 4★ upgrade plan, or a full region sweep — deterministic planning, with an optional AI layer (BYOK or hosted) for free-form questions and in-character narration.
- 🌐 English (default) with a Portuguese toggle. Dark/light themes.

## Running locally

```bash
cd app
npm install
npm run dev
```

On the **Save** page, click **Load demo save (~100%)** to see the app populated without needing your own file.

## Project structure

- `app/` — the app itself (Vite + React + TypeScript + Tailwind + PWA)
- `docs/SAVE_GUIDE.md` — how to get `progress.sav` off a Switch
- `scripts/` — data pipeline and one-off validation spikes
- `reference/NOTES.md` — save-format reverse engineering notes and data sources
- `PLANO.md` — master plan with phases and progress checkboxes (Portuguese)

## Credits & license

Save-format reverse engineering and completion data come from the community (both MIT-licensed):

- [master3243/TOTK-100-live-map](https://github.com/master3243/TOTK-100-live-map) — completion dataset (markers, hashes, coordinates)
- [marcrobledo/savegame-editors](https://github.com/marcrobledo/savegame-editors) — save format and hash dictionary (by MacSpazzy and MrCheeze)

## Disclaimer

Fan project, not for profit, not affiliated with or endorsed by Nintendo. *The Legend of Zelda: Tears of the Kingdom* © Nintendo. All game data, names, and assets referenced belong to their respective owners; this project only reads a local copy of *your own* save file and never transmits it anywhere.

---

# 🇧🇷 Zonai Codex (PT-BR)

**Tracker de 100% de Tears of the Kingdom, importador/editor de save e companion de IA.** PWA mobile-first, local-first — seu save nunca sai do seu dispositivo.

🔗 **Ao vivo**: [zonai-codex.vercel.app](https://zonai-codex.vercel.app)

## Funcionalidades

- 📊 Tracker de todas as 23 categorias de markers do mapa (~3.140 itens) mais 16 coleções/listas de missão, com dashboard (anel True 100%, Map %, detalhamento por categoria).
- 💾 Importe seu `progress.sav` e marque automaticamente tudo que o jogo já registra — o parse completo roda no seu navegador. Veja [docs/SAVE_GUIDE.md](docs/SAVE_GUIDE.md) pra saber como tirar o arquivo do seu Switch.
- ✏️ Editor de save: prepare os checks manuais do Tracker e grave num novo arquivo `.sav`, com diff estilo git do que mudou.
- 🎒 Tab de Inventário: materiais com quantidade real, itens-chave e armaduras com nível de estrelas — tudo lido ao vivo do seu save importado.
- 🗺️ Mapa interativo (Leaflet) nas camadas superfície/céu/profundezas, sincronizado com o Tracker.
- 🧭 Companion "Purah": peça uma rota pros koroks/santuários que faltam, um plano de upgrade de armadura até 4★, ou uma varredura completa de região — planejamento determinístico, com uma camada opcional de IA (chave própria ou hospedada) pra perguntas livres e narração em personagem.
- 🌐 Inglês (padrão) com toggle pra português. Temas claro/escuro.

## Rodando localmente

```bash
cd app
npm install
npm run dev
```

Na página **Save**, clique em **Load demo save (~100%)** pra ver o app populado sem precisar do seu próprio arquivo.

## Estrutura do projeto

- `app/` — o app em si (Vite + React + TypeScript + Tailwind + PWA)
- `docs/SAVE_GUIDE.md` — como tirar o `progress.sav` de um Switch
- `scripts/` — pipeline de dados e spikes de validação pontuais
- `reference/NOTES.md` — notas de engenharia reversa do formato do save e fontes de dados
- `PLANO.md` — plano mestre com fases e checkboxes de progresso

## Créditos e licença

Engenharia reversa do formato do save e dados de completion vêm da comunidade (ambos licenciados MIT):

- [master3243/TOTK-100-live-map](https://github.com/master3243/TOTK-100-live-map) — dataset de completion (markers, hashes, coordenadas)
- [marcrobledo/savegame-editors](https://github.com/marcrobledo/savegame-editors) — formato do save e dicionário de hashes (por MacSpazzy e MrCheeze)

## Aviso

Projeto de fã, sem fins lucrativos, sem afiliação ou endosso da Nintendo. *The Legend of Zelda: Tears of the Kingdom* © Nintendo. Todos os dados, nomes e assets do jogo referenciados pertencem aos seus respectivos donos; este projeto apenas lê uma cópia local do *seu próprio* save e nunca o transmite pra lugar nenhum.
