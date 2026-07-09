# Zonai Codex

**Tears of the Kingdom 100% tracker, save importer/editor & AI companion.** Mobile-first PWA, local-first — your save never leaves your device.

- 🇧🇷 Interface em inglês (default) com toggle pra português.
- 📊 Tracker de todas as 23 categorias de markers (~3.140 itens) + 16 coleções/missões.
- 💾 Importa o `progress.sav` do Switch e marca tudo automaticamente (parse 100% no browser).
- 🗺️ Mapa interativo, edição de save e companion de IA (Purah): em desenvolvimento — ver [PLANO.md](PLANO.md).

## Rodando

```bash
cd app
npm install
npm run dev
```

Na página **Save**, use **Load demo save (~100%)** pra ver o app populado.

## Estrutura

- `app/` — o app (Vite + React + TS + Tailwind + PWA)
- `scripts/` — spikes e pipeline de dados
- `reference/NOTES.md` — engenharia reversa do formato do save e fontes de dados
- `PLANO.md` — plano mestre com fases e checkboxes

## Créditos e licenças

Dados e engenharia reversa da comunidade (ambos MIT):

- [master3243/TOTK-100-live-map](https://github.com/master3243/TOTK-100-live-map) — dataset de completion (markers, hashes, coordenadas)
- [marcrobledo/savegame-editors](https://github.com/marcrobledo/savegame-editors) — formato do save e dicionário de hashes (por MacSpazzy e MrCheeze)

Projeto de fã, sem fins lucrativos. Não afiliado à Nintendo. *The Legend of Zelda: Tears of the Kingdom* © Nintendo.
