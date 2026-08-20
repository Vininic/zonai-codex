// Adiciona a Epona (cavalo exclusivo de amiibo, sem outra forma de obter no
// jogo) a um progress.sav existente, num slot vazio de OwnedHorseList — sem
// tocar em mais nada do arquivo. Reproduz exatamente o que
// buildEditPlan()/grantEpona faz em app/src/lib/saveWriter.ts + horse.ts.
//
// Uso: node scripts/add-epona.mjs <entrada.sav> <saida.sav>
import { readFileSync, writeFileSync } from 'node:fs';

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

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('uso: node scripts/add-epona.mjs <entrada.sav> <saida.sav>');
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

const H = (field) => murmur3(`OwnedHorseList.${field}`);

const namesPtr = values.get(H('ActorName'));
if (namesPtr === undefined) {
  console.error('OwnedHorseList não encontrado neste save.');
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

const names = readNames(namesPtr);
if (names.includes('GameRomHorseEpona')) {
  console.log('Este save já tem a Epona — nada a fazer.');
  process.exit(0);
}
const idx = names.findIndex((n) => n === '');
if (idx === -1) {
  console.error('Estábulo cheio (nenhum slot livre) — não dá pra adicionar a Epona sem substituir outro cavalo.');
  process.exit(1);
}

// mesmos valores de Horse.DEFAULT_VALUES.GameRomHorseEpona no editor de
// referência (marcrobledo/savegame-editors) — é como o amiibo real entrega.
const INTS = {
  Mane: murmur3('Horse_Link_Mane'),
  Saddle: murmur3('GameRomHorseSaddle_06'),
  Rein: murmur3('GameRomHorseReins_06'),
  Toughness: 220,
  Speed: 3,
  ChargeNum: 4,
  HorsePower: 2,
  HorseType: 4,
  ColorType: 0,
  FootType: 0,
  RoomID: 0xffffffff,
  'Body.Pattern': murmur3('01'),
  'Body.EyeColor': murmur3('Black'),
  'Body.PrimaryColor.Red': 14,
  'Body.PrimaryColor.Green': 5,
  'Body.PrimaryColor.Blue': 3,
  'Body.SecondaryColor.Red': 168,
  'Body.SecondaryColor.Green': 149,
  'Body.SecondaryColor.Blue': 104,
  'Body.NoseColor.Red': 5,
  'Body.NoseColor.Green': 4,
  'Body.NoseColor.Blue': 3,
  'Hair.PrimaryColor.Red': 255,
  'Hair.PrimaryColor.Green': 255,
  'Hair.PrimaryColor.Blue': 255,
  'Hair.SecondaryColor.Red': 197,
  'Hair.SecondaryColor.Green': 179,
  'Hair.SecondaryColor.Blue': 136,
};

// nome (slot ActorName, String64)
const nameStart = namesPtr + 4 + idx * 64;
const nameBytes = new Uint8Array(buffer, nameStart, 64);
nameBytes.fill(0);
nameBytes.set(new TextEncoder().encode('GameRomHorseEpona'));

let written = 1;
for (const [field, value] of Object.entries(INTS)) {
  const ptr = values.get(H(field));
  if (ptr === undefined) { console.warn(`campo ausente neste save: OwnedHorseList.${field}`); continue; }
  dv.setUint32(ptr + 4 + idx * 4, value >>> 0, true);
  written++;
}

// nome exibido (WString16, 32 bytes / entrada)
const wnamePtr = values.get(H('Name'));
if (wnamePtr !== undefined) {
  const wstart = wnamePtr + 4 + idx * 0x20;
  const wbytes = new Uint8Array(buffer, wstart, 0x20);
  wbytes.fill(0);
  const label = 'Epona';
  for (let i = 0; i < label.length; i++) dv.setUint16(wstart + i * 2, label.charCodeAt(i), true);
  written++;
}

// laço (float) — a Epona já vem mansa do amiibo
const bondPtr = values.get(H('Familiarity'));
if (bondPtr !== undefined) { dv.setFloat32(bondPtr + 4 + idx * 4, 1, true); written++; }

// familiaridade conferida (BoolArray: 1 bit por entrada, não 4 bytes)
const bondCheckedPtr = values.get(H('IsFamiliarityChecked'));
if (bondCheckedPtr !== undefined) {
  const byteOff = bondCheckedPtr + 4 + Math.floor(idx / 8);
  const bit = 1 << (idx % 8);
  dv.setUint8(byteOff, dv.getUint8(byteOff) | bit);
  written++;
}

writeFileSync(outPath, Buffer.from(buffer));
let h = 2166136261;
for (const x of new Uint8Array(buffer)) { h ^= x; h = Math.imul(h, 16777619); }
console.log(`Epona gravada no slot ${idx} de OwnedHorseList (${written} campos).`);
console.log(`gravado: ${outPath}`);
console.log(`tamanho: ${buffer.byteLength}  fnv1a: ${(h >>> 0).toString(16)}`);
