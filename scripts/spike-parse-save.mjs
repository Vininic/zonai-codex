// Spike: valida o parser do progress.sav contra o fixture ~100% (umar-save)
// Uso: node scripts/spike-parse-save.mjs [caminho-do-progress.sav]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const savePath = process.argv[2] ?? join(ROOT, 'fixtures/umar-save/slot_00/progress.sav');
const dataPath = join(ROOT, 'reference/totk-100-live-map/docs/completion_data.json');

// ---- murmur3_32 (seed 0) ----
function murmur3(str) {
  const bytes = new TextEncoder().encode(str);
  let h = 0;
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  const n = bytes.length & ~3;
  for (let i = 0; i < n; i += 4) {
    let k = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  switch (bytes.length & 3) {
    case 3: k ^= bytes[n + 2] << 16; // fallthrough
    case 2: k ^= bytes[n + 1] << 8;  // fallthrough
    case 1: k ^= bytes[n];
      k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k;
  }
  h ^= bytes.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// sanity check do murmur3 contra hashes conhecidos do savegame-editors
const known = {
  'PlayerStatus.MaxLife': 0xfbe01da1,
  'PlayerStatus.CurrentRupee': 0xa77921d7,
  'PlayerStatus.MaxStamina': 0xf9212c74,
  'PlayerStatus.MaxEnergy': 0xafd01d68,
};
for (const [name, expected] of Object.entries(known)) {
  const got = murmur3(name);
  if (got !== expected) throw new Error(`murmur3 FALHOU: ${name} => ${got.toString(16)}, esperado ${expected.toString(16)}`);
}
console.log('murmur3: OK (4/4 hashes conhecidos)');

// ---- parser ----
const buf = readFileSync(savePath);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
const u32 = (off) => dv.getUint32(off, true);
const f32 = (off) => dv.getFloat32(off, true);

if (u32(0) !== 0x01020304) throw new Error('magic inválido — não é um progress.sav');
const VERSIONS = { 2307552: 'v1.0', 2307656: 'v1.1.x/1.2.x', 2307856: 'v1.4.x' };
console.log(`arquivo: ${buf.length} bytes → versão ${VERSIONS[buf.length] ?? 'DESCONHECIDA'}`);

const META_SAVE_TYPE = 0xa3db7114;
const CLEAR_HASH = 0x62965740;

const values = new Map();
let guidPtr = null;
for (let off = 0x28; off < buf.length - 8; off += 8) {
  const h = u32(off);
  if (h === META_SAVE_TYPE) { guidPtr = u32(off + 4); break; }
  values.set(h, u32(off + 4));
}
if (guidPtr === null) throw new Error('MetaData.SaveTypeHash não encontrado');
console.log(`tabela de hashes: ${values.size} entradas; guidArray @ 0x${guidPtr.toString(16)}`);

const guids = new Set();
for (let off = guidPtr; off < buf.length - 7; off += 8) {
  const lower = u32(off), upper = u32(off + 4);
  if (lower === 0 && upper === 0) break;
  guids.add((BigInt(upper) << 32n) | BigInt(lower));
}
console.log(`guids: ${guids.size}`);

// ---- player stats ----
const rupees = values.get(murmur3('PlayerStatus.CurrentRupee'));
const hearts = values.get(murmur3('PlayerStatus.MaxLife')) / 4;
const staminaRaw = values.get(murmur3('PlayerStatus.MaxStamina'));
const energyRaw = values.get(murmur3('PlayerStatus.MaxEnergy'));
// MaxStamina/MaxEnergy são f32 inline: reinterpretar os bits u32 como float
const asF32 = (v) => { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); return b.getFloat32(0, true); };
console.log(`\nPlayer: ${rupees} rupees | ${hearts} corações | ${asF32(staminaRaw) / 1000} rodas de stamina | ${asF32(energyRaw) / 1000} células de bateria`);

// ---- completion ----
const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const targetRaw = (def) => def.targetValue ? parseInt(def.targetValue, 16) : null;
const isObtained = (def, raw) => {
  const t = targetRaw(def);
  if (def.kind === 'reverse' && t !== null) return raw !== t;
  if (t !== null) return raw === t;
  return raw !== 0;
};

console.log('\n== CATEGORIES (markers) ==');
for (const cat of data.categories) {
  let obtained = 0, seeds = 0;
  for (const item of cat.items) {
    let ok;
    if (cat.kind === 'guid') ok = guids.has(BigInt(item.value));
    else {
      const raw = values.get(parseInt(item.value, 16)) ?? 0;
      if (cat.kind === 'seed') ok = item.kind === 'hidden' ? raw !== 0 : raw === CLEAR_HASH;
      else ok = isObtained(cat, raw) && (item.requires ?? []).every(r => (values.get(parseInt(r, 16)) ?? 0) !== 0);
    }
    if (ok) { obtained++; if (cat.kind === 'seed') seeds += item.kind === 'carry' ? 2 : 1; }
  }
  const extra = cat.kind === 'seed' ? ` (sementes: ${seeds}/1000)` : '';
  console.log(`${cat.id.padEnd(18)} ${obtained}/${cat.items.length}${extra}`);
}

console.log('\n== STATS (kinds simples: positive/reverse) ==');
for (const stat of data.stats) {
  if (!['positive', 'reverse'].includes(stat.kind)) continue;
  let obtained = 0;
  for (const item of stat.items) {
    const raw = values.get(parseInt(item.value, 16)) ?? 0;
    if (isObtained(stat, raw)) obtained++;
  }
  console.log(`${stat.id.padEnd(18)} ${obtained}/${stat.items.length}`);
}
console.log('\n(stats de inventário — materials/key_items/armor — exigem parse do pouch; fora do spike)');
