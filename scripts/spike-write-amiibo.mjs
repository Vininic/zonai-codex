// Spike: valida o ciclo completo de escrita de fabrics_amiibo (kind=positive)
// no editor de save v1, replicando a lógica de saveWriter.ts + completion.ts
// sem precisar do bundler/React. Uso: node scripts/spike-write-amiibo.mjs [save]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const savePath = process.argv[2] ?? join(ROOT, 'fixtures/umar-save/slot_00/progress.sav');
const dataPath = join(ROOT, 'app/public/data/completion_data.json');

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
    case 3: k ^= bytes[n + 2] << 16;
    case 2: k ^= bytes[n + 1] << 8;
    case 1: k ^= bytes[n];
      k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k;
  }
  h ^= bytes.length;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

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

function isRawObtained(def, raw) {
  const target = def.targetValue ? parseInt(def.targetValue, 16) : null;
  if (def.kind === 'reverse' && target !== null) return raw !== target;
  if (target !== null) return raw === target;
  return raw !== 0;
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));
const fabricsStat = data.stats.find((s) => s.id === 'fabrics_amiibo');
if (!fabricsStat) throw new Error('fabrics_amiibo não encontrado no dataset');
console.log(`fabrics_amiibo: kind=${fabricsStat.kind} targetValue=${fabricsStat.targetValue} items=${fabricsStat.items.length}`);

const original = readFileSync(savePath);
const values = parseValues(original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength));

// escolhe um item ainda não obtido nesse save (ou o primeiro, se todos já estiverem)
let target = fabricsStat.items.find((item) => {
  const raw = values.get(parseInt(item.value, 16)) ?? 0;
  return !isRawObtained(fabricsStat, raw);
});
if (!target) {
  target = fabricsStat.items[0];
  console.log('AVISO: todos os itens já estavam obtidos nesse save; testando re-escrita do primeiro mesmo assim.');
}
const hash = parseInt(target.value, 16);
console.log(`item de teste: ${target.label} (${target.id}) hash=0x${hash.toString(16)} valor atual=${values.get(hash) ?? 0}`);

// -- writesForItem (saveWriter.ts): kind=positive, targetValue nulo -> else: writes.set(hash, 1)
const writes = new Map([[hash, 1]]);

// -- applyEdits (saveWriter.ts): clona o buffer e sobrescreve os hashes encontrados
const buffer = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
const dv = new DataView(buffer);
let applied = 0;
for (let off = 0x28; off < buffer.byteLength - 8; off += 8) {
  const h = dv.getUint32(off, true);
  if (h === META_SAVE_TYPE) break;
  const value = writes.get(h);
  if (value !== undefined) {
    dv.setUint32(off + 4, value, true);
    applied++;
  }
}
console.log(`applyEdits: ${applied} hash(es) escrito(s) (esperado 1)`);
if (applied !== 1) throw new Error('FALHOU: hash do item não foi encontrado na tabela do save');

// -- reimport: reparseia o buffer resultante e confirma isStatItemDone
const newValues = parseValues(buffer);
const newRaw = newValues.get(hash) ?? 0;
const obtained = isRawObtained(fabricsStat, newRaw);
console.log(`após reimport: raw=${newRaw} obtained=${obtained}`);
if (!obtained) throw new Error('FALHOU: item não aparece como obtido após reescrita+reimport');

console.log('\nOK: ciclo completo (marcar -> writesForItem -> applyEdits -> reimport) funciona para fabrics_amiibo.');

const outPath = join(ROOT, 'scratch-amiibo-test.sav');
writeFileSync(outPath, Buffer.from(buffer));
console.log(`save de teste gravado em ${outPath} (pode ser importado no app pra conferir via UI)`);
