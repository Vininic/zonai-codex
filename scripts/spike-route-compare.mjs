// Spike: compara o planner v1 (vizinho-mais-próximo puro) com o v2
// (agrupamento por teleporte + 2-opt) sobre pendentes reais de um save.
// Uso: node scripts/spike-route-compare.mjs [caminho-do-progress.sav]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const savePath = process.argv[2] ?? join(ROOT, 'fixtures/umar-save/slot_02/progress.sav');
const dataPath = join(ROOT, 'app/public/data/completion_data.json');

const META_SAVE_TYPE = 0xa3db7114;
const CLEAR_HASH = 0x62965740;

function parseSave(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const values = new Map();
  let guidPtr = -1;
  for (let off = 0x28; off < buf.length - 8; off += 8) {
    const h = dv.getUint32(off, true);
    if (h === META_SAVE_TYPE) { guidPtr = dv.getUint32(off + 4, true); break; }
    values.set(h, dv.getUint32(off + 4, true));
  }
  const guids = new Set();
  for (let off = guidPtr; off < buf.length - 7; off += 8) {
    const lo = dv.getUint32(off, true), hi = dv.getUint32(off + 4, true);
    if (!lo && !hi) break;
    guids.add((BigInt(hi) << 32n) | BigInt(lo));
  }
  return { values, guids };
}

const buf = readFileSync(savePath);
const save = parseSave(buf);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

function doneIds(cat) {
  const done = new Set();
  for (const item of cat.items) {
    let ok;
    if (cat.kind === 'guid') ok = save.guids.has(BigInt(item.value));
    else {
      const raw = save.values.get(parseInt(item.value, 16)) ?? 0;
      if (cat.kind === 'seed') ok = item.kind === 'hidden' ? raw !== 0 : raw === CLEAR_HASH;
      else ok = raw !== 0;
    }
    if (ok) done.add(item.id);
  }
  return done;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pathLength = (start, tour) => {
  let t = 0, cur = start;
  for (const s of tour) { t += dist(cur, s); cur = s; }
  return t;
};
function nearestNeighbour(start, pool) {
  const rem = [...pool], tour = [];
  let cur = start;
  while (rem.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rem.length; i++) { const d = dist(cur, rem[i]); if (d < bd) { bd = d; bi = i; } }
    const nx = rem.splice(bi, 1)[0];
    tour.push(nx); cur = nx;
  }
  return tour;
}
function twoOpt(start, tour) {
  if (tour.length < 4) return tour;
  let best = [...tour], bestLen = pathLength(start, best), improved = true, guard = 0;
  while (improved && guard++ < 40) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const len = pathLength(start, cand);
        if (len < bestLen - 1e-6) { best = cand; bestLen = len; improved = true; }
      }
    }
  }
  return best;
}

const LAYER = 'surface';
const TARGET_CATS = ['koroks', 'caves', 'shrine_chests'];
const TELEPORTS = ['shrines', 'towers', 'lightroots'];
const MAX_STOPS = 24, MAX_PER_LEG = 8;

const doneByCat = new Map(data.categories.map((c) => [c.id, doneIds(c)]));

const targets = [];
for (const cat of data.categories) {
  if (!TARGET_CATS.includes(cat.id)) continue;
  const done = doneByCat.get(cat.id);
  for (const it of cat.items) {
    if ((it.layer ?? 'surface') !== LAYER || done.has(it.id)) continue;
    targets.push({ id: it.id, cat: cat.id, x: it.x, z: it.z });
  }
}
const anchors = [];
for (const cat of data.categories) {
  if (!TELEPORTS.includes(cat.id)) continue;
  const done = doneByCat.get(cat.id);
  for (const it of cat.items) {
    if ((it.layer ?? 'surface') !== LAYER || !done.has(it.id)) continue;
    anchors.push({ x: it.x, z: it.z });
  }
}

console.log(`save: ${savePath.split(/[\\/]/).slice(-2).join('/')}`);
console.log(`alvos pendentes (${TARGET_CATS.join('+')}, ${LAYER}): ${targets.length}`);
console.log(`ancoras de teleporte desbloqueadas: ${anchors.length}\n`);

if (!targets.length || !anchors.length) {
  console.log('save sem pendentes ou sem teleportes desbloqueados nessa camada — troque de slot.');
  process.exit(0);
}

const origin = { x: 0, z: 0 };

// v1: NN puro sobre tudo, cap global
const v1 = nearestNeighbour(origin, targets).slice(0, MAX_STOPS);
const v1Walk = pathLength(origin, v1);

// v2: agrupa por ancora + 2-opt por perna
const byAnchor = new Map();
for (const t of targets) {
  let ba = null, bd = Infinity;
  for (const a of anchors) { const d = dist(a, t); if (d < bd) { bd = d; ba = a; } }
  const key = `${ba.x},${ba.z}`;
  const c = byAnchor.get(key) ?? { anchor: ba, targets: [] };
  c.targets.push(t);
  byAnchor.set(key, c);
}
const remaining = [...byAnchor.values()].map((c) => ({ anchor: c.anchor, targets: [...c.targets] }));
let v2Walk = 0, v2Count = 0, legs = 0;
while (v2Count < MAX_STOPS) {
  const c = remaining.filter((x) => x.targets.length).sort((a, b) => b.targets.length - a.targets.length)[0];
  if (!c) break;
  const room = Math.min(MAX_PER_LEG, MAX_STOPS - v2Count);
  c.targets.sort((a, b) => dist(c.anchor, a) - dist(c.anchor, b));
  const near = c.targets.splice(0, room);
  const tour = twoOpt(c.anchor, nearestNeighbour(c.anchor, near));
  v2Walk += pathLength(c.anchor, tour);
  v2Count += tour.length;
  legs++;
}

const km = (n) => (n / 1000).toFixed(2) + ' km';
console.log(`v1  vizinho-mais-proximo puro : ${v1.length} paradas, ${km(v1Walk)} a pe, 0 teleportes`);
console.log(`v2  teleporte + 2-opt         : ${v2Count} paradas, ${km(v2Walk)} a pe, ${legs} teleportes`);
const saved = (1 - v2Walk / v1Walk) * 100;
console.log(`\ncaminhada evitada: ${saved.toFixed(1)}%  (${km(v1Walk - v2Walk)} a menos, para o mesmo numero de itens)`);
