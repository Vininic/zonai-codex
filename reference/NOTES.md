# Notas de engenharia reversa — formato do save + dados de referência

*Fontes (ambas MIT, exigem atribuição no app):*
- `totk-100-live-map/` — [master3243/TOTK-100-live-map](https://github.com/master3243/TOTK-100-live-map) — dataset completo (`docs/completion_data.json`) + lógica de avaliação (`docs/server.py`)
- `savegame-editors/` — [marcrobledo/savegame-editors](https://github.com/marcrobledo/savegame-editors) — dicionário de hashes (`zelda-totk/zelda-totk.hashes.csv`, por MacSpazzy e MrCheeze) + parser JS original

## Formato do `progress.sav`

- **Magic**: u32 LE em offset `0x00` == `0x01020304`.
- **Versões** (fileSize → versão): 2.307.552 = v1.0 | 2.307.656 = v1.1.x/1.2.x | 2.307.856 = v1.4.x. (Nosso fixture `fixtures/umar-save/slot_00/progress.sav` = 2.307.656 → v1.1/1.2.)
- **Tabela de hashes**: de `0x28` até encontrar o hash `0xA3DB7114` (MetaData.SaveTypeHash), entradas de 8 bytes: `(u32 hash, u32 valor)`.
  - Hashes são **murmur3_32 (seed 0)** do nome da flag GameData (ex.: `PlayerStatus.CurrentRupee` → `0xa77921d7`).
  - Escalares (bool/s32/f32/enum): valor inline no segundo u32.
  - Tipos compostos (Vector3F, String64, arrays, binários): o segundo u32 é um **ponteiro** (offset absoluto no arquivo). Arrays começam com u32 count e depois os elementos (stride: u32=4, Vector3F=12, String64=64, StringUTF8=32).
- **Array de GUIDs**: o valor do hash `0xA3DB7114` aponta pra uma lista de u64 LE (lower u32, upper u32) terminada em (0,0). Usado por bubbulfrogs, hudson signs, sage's wills.

## Semântica de "obtido" (por `kind` do completion_data.json)

- `bool`: raw != 0, ou raw == targetValue quando definido. Shrines/lightroots usam `targetValue` = `0x62965740` (**CLEAR_HASH**, valor do enum "Clear").
- `guid`: o valor do item (decimal string → u64) está presente no array de GUIDs.
- `seed` (koroks): item kind `hidden` → raw != 0; senão raw == CLEAR_HASH. Koroks de transporte (`carry`) valem 2 sementes, os demais 1 (900 markers → 1000 sementes).
- `reverse` (compendium): obtido se raw != targetValue (`0x8d96a2c5` = foto não-tirada/default).
- `positive` (quests/memories/fabrics/recipes/pristine weapons/etc.): raw != 0.
- `inventory_collection` (materials, key items): presença no inventário (pouch) — ver `build_inventory_collection_stat` no server.py.
- `armor_inventory` / `armor_upgraded`: posse e nível de upgrade das armaduras (níveis no pouch; 104 são upgradáveis a 4★).
- Itens podem ter `requires: [hashes]` — todos devem ser != 0.

## Stats de player

- `PlayerStatus.MaxLife` (u32): corações = valor/4 (max 40).
- `PlayerStatus.MaxStamina` (f32): rodas = valor/1000 (max 3).
- `PlayerStatus.MaxEnergy` (f32): células de bateria = valor/1000 (max 48).
- `PlayerStatus.CurrentRupee` (u32) hash `0xa77921d7`.
- `PlayerStatus.SavePos` hash `0xc884818d` → ponteiro pra Vector3F (posição do player!). Correções: `y_render = raw_y - 106`, `z_render = -raw_z`.

## Coordenadas e camadas

- Mundo: x ∈ [-6000, 6000], z ∈ [-5000, 5000]. `world_to_map`: mapX = (x+6000)/12000*6000; mapY = (5000-z)/10000*5000 (imagem 6000×5000).
- Camada por altura: y >= SKY_MIN_Y → sky; y < DEPTHS_MAX_Y → depths; senão surface (conferir constantes exatas no server.py).

## Dataset (completion_data.json)

- `categories` (23, com coordenadas — vão pro mapa): towers 15, shrines 152, shrine_chests 166, lightroots 120, caves 197, bubbulfrogs 147, hudson_sign 81, dungeon_bosses 12, flux_construct 35, hinox 69, stone_talus 87, molduga 4, frox 40, gleeok 14, wells 58, chasms 36, koroks 900, schema_stone 12, yiga_schematic 34, old_map 62, armor (chests) 85, sage_will 20, general_locations 794. Total ~3.140 markers.
- `stats` (16, sem coordenadas): compendium 509, armor_inventory 136, armor_upgraded 104, pristine_weapons 33, fabrics 29, fabrics_amiibo 29, recipes 228, materials 251, key_items 38, quests_main 21, quests_side 139, quests_adventure 60, quests_shrine 31, memories 18, character_profiles 22, zonai_devices 27.
- Item de category: `{id, value(hash hex), x, y, z, layer, note?}`; item de stat: `{id, value, label}`.

## hashes.csv (savegame-editors)

- ~1.7MB, formato `;`-separado, inclui linhas `EnumValues;<padrão>;<valores>` no topo. Dicionário completo hash→nome pra funcionalidades além do dataset (editor genérico futuro).
