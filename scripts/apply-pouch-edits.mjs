// Aplica num progress.sav as edições de pouch que o editor do app faz —
// fora do browser, pra poder entregar o arquivo direto. Mesma lógica de
// app/src/lib/saveWriter.ts (grant de equipamento, flechas, stats de cavalo):
// só escreve em slots existentes ou vazios, nunca muda o tamanho do arquivo.
//
// Uso: node scripts/apply-pouch-edits.mjs <entrada.sav> <saida.sav> [--dry]
import { readFileSync, writeFileSync } from 'node:fs';

const META = 0xa3db7114;

// --- o que aplicar -----------------------------------------------------
/** enche TODOS os slots livres de escudo com Hylian Shield na durabilidade cheia */
const SHIELD_FILL = { id: 'Weapon_Shield_030', durability: 800 };
/** único tipo de flecha do jogo; 999 é o teto de pilha */
const ARROW_TARGET = 999;
/**
 * Stats no máximo pro cavalo com este nome. `stamina: 0` é "Infinito" — não é
 * chute: os cavalos gigantes (00L/01L) já vêm com 0 neste mesmo save, então é
 * valor que o próprio jogo grava. Força vai a 350 (teto do editor de
 * referência), velocidade e tração a 4 (★★★★★).
 */
const HORSE_MAX = { name: 'Nightmare', toughness: 350, speed: 4, stamina: 0, pull: 4, bond: 1 };
// -----------------------------------------------------------------------

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
  console.error('uso: node scripts/apply-pouch-edits.mjs <entrada.sav> <saida.sav> [--dry]');
  process.exit(1);
}

const src = readFileSync(inPath);
const buffer = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
const before = Buffer.from(new Uint8Array(buffer));
const dv = new DataView(buffer);
const bytes = new Uint8Array(buffer);

const values = new Map();
for (let o = 0x28; o < buffer.byteLength - 8; o += 8) {
  const h = dv.getUint32(o, true);
  if (h === META) break;
  values.set(h, dv.getUint32(o + 4, true));
}

const readName = (ptr, i) => {
  const s = ptr + 4 + i * 64;
  const slice = bytes.subarray(s, s + 64);
  const z = slice.indexOf(0);
  return Buffer.from(z === -1 ? slice : slice.subarray(0, z)).toString('utf8').trim();
};
const writeName = (ptr, i, v) => {
  const s = ptr + 4 + i * 64;
  const slot = new Uint8Array(buffer, s, 64);
  slot.fill(0);
  slot.set(new TextEncoder().encode(v));
};
const readW16 = (ptr, i) => {
  let out = '';
  for (let j = 0; j < 0x20; j += 2) {
    const c = dv.getUint16(ptr + 4 + i * 0x20 + j, true);
    if (!c) break;
    out += String.fromCharCode(c);
  }
  return out;
};
const setU32 = (ptr, i, v) => dv.setUint32(ptr + 4 + i * 4, v >>> 0, true);

const log = [];

// ---- 1) escudos: enche todo slot livre DENTRO da capacidade desbloqueada ----
{
  // CRÍTICO: o array tem 40 posições físicas, mas o jogo só considera válidas
  // as primeiras `Pouch.Shield.ValidNum` (as que você desbloqueou com os
  // Korok seeds). Escrever além disso corrompe o save — o jogo trata o arquivo
  // como inválido e cai na tela inicial. Aprendido do jeito ruim.
  const validPtr = values.get(0x05271e7d); // Pouch.Shield.ValidNum
  const nP = values.get(murmur3('Pouch.Shield.Content.Name'));
  const lP = values.get(murmur3('Pouch.Shield.Content.Life'));
  const eP = values.get(murmur3('Pouch.Shield.Content.Effect.Type'));
  const vP = values.get(murmur3('Pouch.Shield.Content.Effect.Value'));
  if (nP === undefined) {
    log.push('escudos: arrays não encontrados');
  } else {
    const physical = dv.getUint32(nP, true);
    const unlocked = validPtr === undefined ? physical : dv.getUint32(validPtr + 4, true);
    const cap = Math.min(physical, unlocked);
    let added = 0;
    for (let i = 0; i < cap; i++) {
      if (readName(nP, i)) continue;
      if (!dry) {
        writeName(nP, i, SHIELD_FILL.id);
        setU32(lP, i, SHIELD_FILL.durability);
        setU32(eP, i, 0); // sem modificador
        setU32(vP, i, 0);
      }
      added++;
    }
    log.push(`escudos: ${added} Hylian Shield (dur ${SHIELD_FILL.durability}) — pouch ${cap}/${cap} desbloqueados (array tem ${physical} posições, mas só ${unlocked} valem)`);
  }
}

// ---- 2) flechas ----
{
  const nP = values.get(murmur3('Pouch.Arrow.Content.Name'));
  const sP = values.get(murmur3('Pouch.Arrow.Content.StockNum'));
  if (nP === undefined || sP === undefined) {
    log.push('flechas: arrays não encontrados');
  } else {
    const cap = dv.getUint32(nP, true);
    let idx = -1;
    for (let i = 0; i < cap; i++) if (readName(nP, i) === 'NormalArrow') { idx = i; break; }
    if (idx === -1) for (let i = 0; i < cap; i++) if (!readName(nP, i)) { idx = i; break; }
    if (idx === -1) {
      log.push('flechas: sem slot disponível');
    } else {
      const antes = dv.getUint32(sP + 4 + idx * 4, true);
      if (!dry) {
        writeName(nP, idx, 'NormalArrow');
        setU32(sP, idx, ARROW_TARGET);
      }
      log.push(`flechas: ${antes} -> ${ARROW_TARGET}`);
    }
  }
}

// ---- 3) cavalo com stats no máximo ----
{
  const H = (f) => values.get(murmur3('OwnedHorseList.' + f));
  const nP = H('ActorName');
  const wP = H('Name');
  if (nP === undefined || wP === undefined) {
    log.push('cavalos: arrays não encontrados');
  } else {
    const cap = dv.getUint32(nP, true);
    let idx = -1;
    for (let i = 0; i < cap; i++) {
      if (readName(nP, i) && readW16(wP, i) === HORSE_MAX.name) { idx = i; break; }
    }
    if (idx === -1) {
      log.push(`cavalos: nenhum chamado "${HORSE_MAX.name}" neste save`);
    } else {
      const g = (f) => dv.getUint32(H(f) + 4 + idx * 4, true);
      const antes = `forca=${g('Toughness')} vel=${g('Speed')} stam=${g('ChargeNum')} tracao=${g('HorsePower')}`;
      if (!dry) {
        setU32(H('Toughness'), idx, HORSE_MAX.toughness);
        setU32(H('Speed'), idx, HORSE_MAX.speed);
        setU32(H('ChargeNum'), idx, HORSE_MAX.stamina);
        setU32(H('HorsePower'), idx, HORSE_MAX.pull);
        dv.setFloat32(H('Familiarity') + 4 + idx * 4, HORSE_MAX.bond, true);
      }
      log.push(`cavalo "${HORSE_MAX.name}" (slot ${idx}): ${antes} -> forca=${HORSE_MAX.toughness} vel=${HORSE_MAX.speed} stam=${HORSE_MAX.stamina}(infinito) tracao=${HORSE_MAX.pull}`);
    }
  }
}

log.forEach((l) => console.log(l));

if (dry) {
  console.log('\n(--dry: nada gravado)');
} else {
  writeFileSync(outPath, Buffer.from(buffer));
  const after = Buffer.from(new Uint8Array(buffer));
  let diff = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diff++;
  let h = 2166136261;
  for (const x of after) { h ^= x; h = Math.imul(h, 16777619); }
  console.log(`\ngravado: ${outPath}`);
  console.log(`tamanho: ${buffer.byteLength} (igual: ${before.length === after.length})  bytes alterados: ${diff}  fnv1a: ${(h >>> 0).toString(16)}`);
}
