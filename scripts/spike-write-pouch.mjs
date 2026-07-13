// Spike: valida escrita em arrays do pouch (materials/armor_inventory/key_items)
// aproveitando slots vazios com capacidade sobrando (ver investigação na sessão).
// Uso: node scripts/spike-write-pouch.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const savePath = join(ROOT, 'fixtures/umar-save/slot_00/progress.sav');
const dataPath = join(ROOT, 'app/public/data/completion_data.json');

const META_SAVE_TYPE = 0xa3db7114;

function parseValues(buffer) {
  const dv = new DataView(buffer);
  const values = new Map();
  for (let off = 0x28; off < buffer.byteLength - 8; off += 8) {
    const h = dv.getUint32(off, true);
    if (h === META_SAVE_TYPE) break;
    values.set(h, dv.getUint32(off + 4, true));
  }
  return values;
}

function readString64Array(buffer, pointer) {
  const dv = new DataView(buffer);
  const count = dv.getUint32(pointer, true);
  const start = pointer + 4;
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    const slice = bytes.subarray(start + i * 64, start + (i + 1) * 64);
    const nul = slice.indexOf(0);
    out.push(decoder.decode(nul === -1 ? slice : slice.subarray(0, nul)).trim());
  }
  return out;
}

function writeString64Slot(buffer, pointer, index, text) {
  const dv = new DataView(buffer);
  const start = pointer + 4 + index * 64;
  const bytes = new Uint8Array(buffer, start, 64);
  bytes.fill(0);
  const encoded = new TextEncoder().encode(text);
  if (encoded.length >= 64) throw new Error(`actorName muito longo: ${text}`);
  bytes.set(encoded);
}

function findEmptyIndex(names) {
  return names.findIndex((n) => n === '');
}

const original = readFileSync(savePath);
const originalBuf = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
const values = parseValues(originalBuf);
const data = JSON.parse(readFileSync(dataPath, 'utf8'));

const buffer = originalBuf.slice(0);
const dv = new DataView(buffer);

// ---- 1) materiais: dar um material nunca obtido + bombar estoque de um já obtido ----
const materialsStat = data.stats.find((s) => s.id === 'materials');
const upgradedStat = data.stats.find((s) => s.id === 'armor_upgraded');
const stockHash = upgradedStat.upgradeMaterials.materialStockArrayHash;
const namesPtr = values.get(parseInt(materialsStat.arrayHash, 16));
const stockPtr = values.get(parseInt(stockHash, 16));
const names = readString64Array(buffer, namesPtr);

const neverHeld = materialsStat.items.find((it) => !names.includes(it.actorName));
if (!neverHeld) throw new Error('todos os materiais já estão no save — spike precisa de um save parcial');
const emptyIdx = findEmptyIndex(names);
if (emptyIdx === -1) throw new Error('sem slot vazio no array de materiais');
console.log(`materiais: dando "${neverHeld.label}" (${neverHeld.actorName}) no slot vazio ${emptyIdx}`);
writeString64Slot(buffer, namesPtr, emptyIdx, neverHeld.actorName);
dv.setUint32(stockPtr + 4 + emptyIdx * 4, 999, true);

const alreadyHeldIdx = names.findIndex((n) => n !== '');
const heldName = names[alreadyHeldIdx];
const oldStock = dv.getUint32(stockPtr + 4 + alreadyHeldIdx * 4, true);
console.log(`materiais: bombando estoque de "${heldName}" (slot ${alreadyHeldIdx}) de ${oldStock} pra 999`);
dv.setUint32(stockPtr + 4 + alreadyHeldIdx * 4, 999, true);

// ---- 2) armadura: dar uma peça nunca possuída ----
const armorStat = data.stats.find((s) => s.id === 'armor_inventory');
const armorPtr = values.get(parseInt(armorStat.arrayHash, 16));
const armorNames = readString64Array(buffer, armorPtr);
const armorNeverOwned = armorStat.items.find((it) => !it.ids.some((id) => armorNames.includes(id)));
const armorEmptyIdx = findEmptyIndex(armorNames);
console.log(`armadura: dando "${armorNeverOwned.label}" (${armorNeverOwned.baseId}) no slot vazio ${armorEmptyIdx}`);
writeString64Slot(buffer, armorPtr, armorEmptyIdx, armorNeverOwned.baseId);

// ---- 3) item-chave: dar um nunca obtido ----
const keyStat = data.stats.find((s) => s.id === 'key_items');
const keyPtr = values.get(parseInt(keyStat.arrayHash, 16));
const keyNames = readString64Array(buffer, keyPtr);
const keyNeverHeld = keyStat.items.find((it) => !keyNames.includes(it.actorName)) ?? keyStat.items[0]
const keyEmptyIdx = findEmptyIndex(keyNames);
console.log(`item-chave: dando "${keyNeverHeld.label}" (${keyNeverHeld.actorName}) no slot vazio ${keyEmptyIdx}`);
writeString64Slot(buffer, keyPtr, keyEmptyIdx, keyNeverHeld.actorName);

// ---- reparse e confere tudo ----
const newValues = parseValues(buffer);
const newMaterialNames = readString64Array(buffer, values.get(parseInt(materialsStat.arrayHash, 16)));
const newArmorNames = readString64Array(buffer, values.get(parseInt(armorStat.arrayHash, 16)));
const newKeyNames = readString64Array(buffer, values.get(parseInt(keyStat.arrayHash, 16)));

const checks = [
  ['material nunca obtido agora presente', newMaterialNames.includes(neverHeld.actorName)],
  ['estoque do material novo = 999', dv.getUint32(stockPtr + 4 + emptyIdx * 4, true) === 999],
  ['estoque do material já obtido = 999', dv.getUint32(stockPtr + 4 + alreadyHeldIdx * 4, true) === 999],
  ['armadura nunca possuída agora presente', newArmorNames.includes(armorNeverOwned.baseId)],
  ['item-chave nunca obtido agora presente', newKeyNames.includes(keyNeverHeld.actorName)],
];
let allOk = true;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FALHOU'}: ${label}`);
  if (!ok) allOk = false;
}

// diff byte-a-byte fora dos ranges tocados, pra garantir que nada mais mudou
const origBytes = new Uint8Array(originalBuf);
const newBytes = new Uint8Array(buffer);
const touchedRanges = [
  [namesPtr + 4 + emptyIdx * 64, 64],
  [stockPtr + 4 + emptyIdx * 4, 4],
  [stockPtr + 4 + alreadyHeldIdx * 4, 4],
  [armorPtr + 4 + armorEmptyIdx * 64, 64],
  [keyPtr + 4 + keyEmptyIdx * 64, 64],
];
const isTouched = (off) => touchedRanges.some(([start, len]) => off >= start && off < start + len);
let strayDiffs = 0;
for (let i = 0; i < origBytes.length; i++) {
  if (origBytes[i] !== newBytes[i] && !isTouched(i)) {
    strayDiffs++;
    if (strayDiffs <= 5) console.log(`  diff inesperado no offset 0x${i.toString(16)}: ${origBytes[i]} -> ${newBytes[i]}`);
  }
}
console.log(`\ndiffs fora dos ranges esperados: ${strayDiffs} (esperado 0)`);
if (strayDiffs > 0) allOk = false;

console.log(allOk ? '\nOK: escrita em arrays do pouch é segura e funciona.' : '\nFALHOU: revisar antes de usar em saves reais.');

const outPath = join(ROOT, 'scratch-pouch-test.sav');
writeFileSync(outPath, Buffer.from(buffer));
console.log(`save de teste gravado em ${outPath}`);
