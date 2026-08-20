// Gera app/public/data/horses.json (nomes reais em EN) a partir da lista
// Horse.AVAILABILITY do editor do marcrobledo — mesma origem do equipment.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REF = join(ROOT, 'reference/savegame-editors/zelda-totk');

const horseSrc = readFileSync(join(REF, 'zelda-totk.class.horse.js'), 'utf8');
const localeLines = readFileSync(join(REF, 'locale/zelda-totk.locale.en.js'), 'utf8').split('\n');

const localeMap = new Map();
for (const line of localeLines) {
  const idx = line.indexOf(":'");
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const rest = line.slice(idx + 2);
  const end = rest.lastIndexOf("',") >= 0 ? rest.lastIndexOf("',") : rest.lastIndexOf("'");
  if (end === -1) continue;
  const val = rest.slice(0, end).replace(/\\'/g, "'");
  localeMap.set(key, val);
}

const availMatch = horseSrc.match(/Horse\.AVAILABILITY\s*=\s*\[([\s\S]*?)\];/);
const ids = [...availMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

const untamable = new Set(['GameRomHorseBone', 'GameRomHorseBone_AllDay', 'GameRomHorseForStreetVender', 'GameRomHorseNushi']);

const horses = ids.map((id) => ({
  id,
  label: localeMap.get(id) ?? id,
  amiiboOnly: id === 'GameRomHorseEpona',
  untamable: untamable.has(id),
}));

writeFileSync(join(ROOT, 'app/public/data/horses.json'), JSON.stringify({ horses }, null, 0));
console.log(`${horses.length} cavalos`);
