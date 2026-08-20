// Reproduz, fora do browser, exatamente a mesma edição que o app produziu, pra
// poder entregar o arquivo (o download do painel de preview não chega ao disco).
// A prova de que é o mesmo arquivo é o hash FNV-1a: o app reportou 3a72dedd.
//
// Uso: node scripts/apply-user-edits.mjs <entrada.sav> <saida.sav>
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('uso: node scripts/apply-user-edits.mjs <entrada.sav> <saida.sav>');
  process.exit(1);
}

const META = 0xa3db7114;

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

const src = readFileSync(inPath);
const buffer = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
const dv = new DataView(buffer);

const values = new Map();
for (let o = 0x28; o < buffer.byteLength - 8; o += 8) {
  const h = dv.getUint32(o, true);
  if (h === META) break;
  values.set(h, dv.getUint32(o + 4, true));
}

const data = JSON.parse(readFileSync(join(ROOT, 'app/public/data/completion_data.json'), 'utf8'));

// ---- helpers de array (mesmo layout do saveWriter) ----
const readNames = (ptr) => {
  const count = dv.getUint32(ptr, true);
  const out = [];
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < count; i++) {
    const s = ptr + 4 + i * 64;
    const slice = bytes.subarray(s, s + 64);
    const z = slice.indexOf(0);
    out.push(Buffer.from(z === -1 ? slice : slice.subarray(0, z)).toString('utf8').trim());
  }
  return out;
};
const writeName = (ptr, idx, name) => {
  const start = ptr + 4 + idx * 64;
  const bytes = new Uint8Array(buffer, start, 64);
  bytes.fill(0);
  bytes.set(new TextEncoder().encode(name));
};
const writeInt = (ptr, idx, v) => dv.setUint32(ptr + 4 + idx * 4, v >>> 0, true);
const setScalar = (hash, v) => {
  for (let o = 0x28; o < buffer.byteLength - 8; o += 8) {
    const h = dv.getUint32(o, true);
    if (h === META) break;
    if (h === hash) { dv.setUint32(o + 4, v >>> 0, true); return true; }
  }
  return false;
};

const log = [];

// ---- 1) rupees ----
const H_RUPEE = murmur3('PlayerStatus.CurrentRupee');
const oldRupee = values.get(H_RUPEE) ?? 0;
setScalar(H_RUPEE, oldRupee + 60000);
log.push(`rupees: ${oldRupee} -> ${oldRupee + 60000}`);

// ---- 2) tecidos amiibo (só os que já têm flag alocada neste save) ----
const amiibo = data.stats.find((s) => s.id === 'fabrics_amiibo');
let wrote = 0; const skipped = [];
for (const item of amiibo.items) {
  const hash = parseInt(item.value, 16);
  if (!values.has(hash)) { skipped.push(item.label); continue; }
  setScalar(hash, 1); wrote++;
}
log.push(`tecidos amiibo: ${wrote} gravados, ${skipped.length} sem flag no save (${skipped.join(', ')})`);

// ---- 3) materiais de upgrade de armadura ----
const upgraded = data.stats.find((s) => s.id === 'armor_upgraded');
const block = upgraded.upgradeMaterials;
const inv = data.stats.find((s) => s.id === 'armor_inventory');
const matsStat = data.stats.find((s) => s.id === 'materials');

const matNamesPtr = values.get(parseInt(matsStat.arrayHash, 16));
const stockPtr = values.get(parseInt(block.materialStockArrayHash, 16));
const armorNames = new Set(readNames(values.get(parseInt(inv.arrayHash, 16))).filter(Boolean));

// estrelas atuais por peça
const starsOf = (label) => {
  const it = inv.items.find((i) => (i.label ?? i.id) === label);
  if (!it) return null;
  const owned = (it.ids ?? []).some((id) => armorNames.has(id));
  if (!owned) return null;
  let stars = 0;
  for (const lvl of it.levels ?? []) if (armorNames.has(lvl.id)) stars = Math.max(stars, lvl.stars);
  return stars;
};

// mesma ordem de iteração do app (Map preserva ordem de inserção)
const need = new Map();
for (const entry of block.armor) {
  const stars = starsOf(entry.label);
  if (stars === null) continue;
  for (const [lvlText, costs] of Object.entries(entry.levels)) {
    if (parseInt(lvlText, 10) <= stars) continue;
    for (const c of costs) need.set(c.material, (need.get(c.material) ?? 0) + c.quantity);
  }
}

const matNames = readNames(matNamesPtr);
const stockByActor = new Map();
for (let i = 0; i < matNames.length; i++) if (matNames[i]) stockByActor.set(matNames[i], dv.getUint32(stockPtr + 4 + i * 4, true));
const actorOf = new Map(matsStat.items.map((i) => [i.label ?? i.id, i.actorName]));

const claimed = new Set();
let filled = 0, added = 0;
for (const [label, total] of need) {
  const actor = actorOf.get(label);
  if (!actor) continue;
  const have = stockByActor.get(actor) ?? 0;
  if (have >= total) continue;
  const target = Math.min(999, total);
  let idx = matNames.indexOf(actor);
  if (idx === -1) {
    idx = matNames.findIndex((n, i) => n === '' && !claimed.has(i));
    if (idx === -1) continue;
    claimed.add(idx);
    matNames[idx] = actor;
    writeName(matNamesPtr, idx, actor);
    added++;
  }
  writeInt(stockPtr, idx, target);
  filled++;
}
log.push(`materiais: ${filled} quantidades ajustadas (${added} tipos novos no pouch)`);

// ---- 4) arcos ----
const bowNamePtr = values.get(murmur3('Pouch.Bow.Content.Name'));
const bowLifePtr = values.get(murmur3('Pouch.Bow.Content.Life'));
const bowEffPtr = values.get(murmur3('Pouch.Bow.Content.Effect.Type'));
const bowEffVPtr = values.get(murmur3('Pouch.Bow.Content.Effect.Value'));
const bowNames = readNames(bowNamePtr);
const BOWS = [
  ['Weapon_Bow_032', 45, 'FiveWay', 5],
  ['Weapon_Bow_033', 60, 'AttackUpPlus', 10],
  ['Weapon_Bow_028', 60, 'AttackUpPlus', 10],
  ['Weapon_Bow_036', 60, 'AttackUpPlus', 10],
  ['Weapon_Bow_026', 45, 'FiveWay', 5],
];
const bowClaimed = new Set();
for (const [id, durab, mod, val] of BOWS) {
  const idx = bowNames.findIndex((n, i) => n === '' && !bowClaimed.has(i));
  if (idx === -1) { log.push(`arco ${id}: sem slot livre`); continue; }
  bowClaimed.add(idx);
  writeName(bowNamePtr, idx, id);
  writeInt(bowLifePtr, idx, durab);
  writeInt(bowEffPtr, idx, murmur3(mod));
  writeInt(bowEffVPtr, idx, val);
}
log.push(`arcos: ${bowClaimed.size} adicionados em slots vazios`);

writeFileSync(outPath, Buffer.from(buffer));
let h = 2166136261;
for (const x of new Uint8Array(buffer)) { h ^= x; h = Math.imul(h, 16777619); }
log.forEach((l) => console.log(l));
console.log(`\ngravado: ${outPath}`);
console.log(`tamanho: ${buffer.byteLength}  fnv1a: ${(h >>> 0).toString(16)}`);
