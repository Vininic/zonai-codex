// Gera app/public/data/equipment.json a partir do savegame-editor do Marc Robledo
// (reference/savegame-editors/zelda-totk, MIT) — nomes de itens compilados por
// Echocolat, Exincracci, HylianLZ, Karlos007 e ApacheThunder.
//
// Uso: node scripts/build-equipment-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REF = join(ROOT, 'reference/savegame-editors/zelda-totk');

const locale = readFileSync(join(REF, 'locale/zelda-totk.locale.en.js'), 'utf8');
const equip = readFileSync(join(REF, 'zelda-totk.class.equipment.js'), 'utf8');

// durabilidade padrão por item (o resto cai em 70, como no editor de referência)
const durBlock = /DEFAULT_DURABILITY\s*=\s*(?:Object\.freeze\()?\{([\s\S]*?)\n\}/.exec(equip);
const durability = {};
for (const m of durBlock[1].matchAll(/'?([A-Za-z0-9_]+)'?\s*:\s*(\d+)/g)) {
  durability[m[1]] = parseInt(m[2], 10);
}

// nomes em inglês; entradas prefixadas com '*' são internas/de evento no editor
const names = {};
const nameRe = /^(Weapon_[A-Za-z0-9_]+)\s*:\s*'((?:\\.|[^'\\])*)'/gm;
for (const m of locale.matchAll(nameRe)) {
  const label = m[2].replace(/\\'/g, "'");
  if (label.startsWith('*')) continue;
  names[m[1]] = label;
}

const entries = Object.entries(names).sort(([a], [b]) => a.localeCompare(b));
const pick = (test) =>
  entries.filter(([id]) => test(id)).map(([id, label]) => ({ id, label, durability: durability[id] ?? 70 }));

const out = {
  bows: pick((id) => id.startsWith('Weapon_Bow_')),
  shields: pick((id) => id.startsWith('Weapon_Shield_')),
  weapons: pick((id) => /^Weapon_(Sword|Lsword|Spear)_/.test(id)),
};

writeFileSync(join(ROOT, 'app/public/data/equipment.json'), JSON.stringify(out, null, 1), 'utf8');
for (const [k, v] of Object.entries(out)) console.log(`${k}: ${v.length}`);
console.log('exemplo:', JSON.stringify(out.bows.slice(0, 2)));
