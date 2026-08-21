// Enche os materiais de upgrade de armadura num progress.sav, com folga.
//
// Duas diferenças em relação ao botão "Fill armor mats" do app:
//   1. mira TODA armadura do jogo a 4★, não só as peças que você já tem —
//      senão o estoque fica justo e some assim que você acha uma peça nova;
//   2. os itens presos a tempo (pedaço de dragão + fragmento de estrela)
//      recebem um piso generoso em vez do número exato. Esses não se
//      "grindam": o dragão só devolve a peça numa janela ligada à lua
//      sangrenta e a estrela cai em hora/lugar aleatório à noite. Ficar com
//      exatamente 2 de garra do Dinraal significa voltar a esperar dragão na
//      primeira troca de planos.
//
// Uso: node scripts/fill-armor-materials.mjs <entrada.sav> <saida.sav> [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const META = 0xa3db7114;
const CAP = 999; // teto de pilha do jogo

/** piso pros itens presos a tempo (ver cabeçalho) */
const TIME_GATED_FLOOR = 50;
const STAR_FRAGMENT_FLOOR = 200;
/** folga nos demais: o custo cheio + 25%, pra reordenar upgrades sem voltar a farmar */
const SLACK = 1.25;

const DRAGON_ACTORS = new Set([
  'Item_Enemy_211', 'Item_Enemy_212', 'Item_Enemy_213', 'Item_Enemy_214', // chifres
  'Item_Enemy_228', 'Item_Enemy_229', 'Item_Enemy_230', 'Item_Enemy_231', // lascas de espinho
  'Item_Enemy_38', 'Item_Enemy_49', 'Item_Enemy_53', 'Item_Enemy_158', // escamas
  'Item_Enemy_39', 'Item_Enemy_50', 'Item_Enemy_54', 'Item_Enemy_159', // garras
  'Item_Enemy_47', 'Item_Enemy_51', 'Item_Enemy_55', 'Item_Enemy_160', // lascas de presa
]);
const STAR_FRAGMENT = 'Item_Ore_J';

function murmur3(str) {
  const b = new TextEncoder().encode(str);
  let h = 0;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const n = b.length & ~3;
  for (let i = 0; i < n; i += 4) {
    let k = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  switch (b.length & 3) {
    case 3: k ^= b[n + 2] << 16;
    case 2: k ^= b[n + 1] << 8;
    case 1: k ^= b[n]; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k;
  }
  h ^= b.length; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

const inPath = process.argv[2];
const outPath = process.argv[3];
const dry = process.argv.includes('--dry');
if (!inPath || !outPath) {
  console.error('uso: node scripts/fill-armor-materials.mjs <entrada.sav> <saida.sav> [--dry]');
  process.exit(1);
}

const src = readFileSync(inPath);
const buffer = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
const dv = new DataView(buffer);
const bytes = new Uint8Array(buffer);

const values = new Map();
for (let o = 0x28; o < buffer.byteLength - 8; o += 8) {
  const h = dv.getUint32(o, true);
  if (h === META) break;
  values.set(h, dv.getUint32(o + 4, true));
}

const data = JSON.parse(readFileSync(join(ROOT, 'app/public/data/completion_data.json'), 'utf8'));
const upgraded = data.stats.find((s) => s.id === 'armor_upgraded');
const block = upgraded.upgradeMaterials;
const materialsStat = data.stats.find((s) => s.id === 'materials');

const matNamesPtr = values.get(parseInt(materialsStat.arrayHash, 16));
const stockPtr = values.get(parseInt(block.materialStockArrayHash, 16));
if (matNamesPtr === undefined || stockPtr === undefined) {
  console.error('arrays de material não encontrados neste save.');
  process.exit(1);
}

const readNames = (ptr) => {
  const count = dv.getUint32(ptr, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = ptr + 4 + i * 64;
    const slice = bytes.subarray(s, s + 64);
    const z = slice.indexOf(0);
    out.push(Buffer.from(z === -1 ? slice : slice.subarray(0, z)).toString('utf8').trim());
  }
  return out;
};

// custo de TODA armadura do jogo, do 1★ ao 4★
const need = new Map();
for (const entry of block.armor) {
  for (const costs of Object.values(entry.levels)) {
    for (const c of costs) need.set(c.material, (need.get(c.material) ?? 0) + c.quantity);
  }
}

const matNames = readNames(matNamesPtr);
const stockOf = new Map();
for (let i = 0; i < matNames.length; i++) if (matNames[i]) stockOf.set(matNames[i], dv.getUint32(stockPtr + 4 + i * 4, true));
const actorOf = new Map(materialsStat.items.map((i) => [i.label ?? i.id, i.actorName]));

const targetFor = (actor, cost) => {
  if (actor === STAR_FRAGMENT) return Math.max(STAR_FRAGMENT_FLOOR, cost);
  if (DRAGON_ACTORS.has(actor)) return Math.max(TIME_GATED_FLOOR, cost);
  return Math.ceil(cost * SLACK);
};

const writeName = (idx, name) => {
  const start = matNamesPtr + 4 + idx * 64;
  const slot = new Uint8Array(buffer, start, 64);
  slot.fill(0);
  slot.set(new TextEncoder().encode(name));
};

const claimed = new Set();
const changes = [];
let added = 0;
for (const [label, cost] of need) {
  const actor = actorOf.get(label);
  if (!actor) continue;
  const have = stockOf.get(actor) ?? 0;
  const target = Math.min(CAP, targetFor(actor, cost));
  if (have >= target) continue;

  let idx = matNames.indexOf(actor);
  if (idx === -1) {
    idx = matNames.findIndex((n, i) => n === '' && !claimed.has(i));
    if (idx === -1) { console.warn(`sem slot livre no pouch para ${label}`); continue; }
    claimed.add(idx);
    matNames[idx] = actor;
    if (!dry) writeName(idx, actor);
    added++;
  }
  if (!dry) dv.setUint32(stockPtr + 4 + idx * 4, target, true);
  changes.push({ label, actor, have, target, gated: DRAGON_ACTORS.has(actor) || actor === STAR_FRAGMENT });
}

changes.sort((a, b) => (a.gated === b.gated ? b.target - b.have - (a.target - a.have) : a.gated ? -1 : 1));
const gated = changes.filter((c) => c.gated);
console.log(`=== PRESOS A TEMPO (dragão + estrela): ${gated.length} ===`);
for (const c of gated) console.log(`  ${c.label.padEnd(32)} ${String(c.have).padStart(3)} -> ${c.target}`);
const rest = changes.filter((c) => !c.gated);
console.log(`\n=== DEMAIS: ${rest.length} ===`);
for (const c of rest) console.log(`  ${c.label.padEnd(32)} ${String(c.have).padStart(3)} -> ${c.target}`);
console.log(`\n${changes.length} materiais ajustados (${added} tipos novos no pouch)`);
console.log(`slots de material usados: ${matNames.filter(Boolean).length} / ${matNames.length}`);

if (dry) {
  console.log('\n(--dry: nada foi gravado)');
} else {
  writeFileSync(outPath, Buffer.from(buffer));
  let h = 2166136261;
  for (const x of new Uint8Array(buffer)) { h ^= x; h = Math.imul(h, 16777619); }
  console.log(`\ngravado: ${outPath}`);
  console.log(`tamanho: ${buffer.byteLength}  fnv1a: ${(h >>> 0).toString(16)}`);
}
