// Converte os ícones do editor do marcrobledo (128px PNG, ~35 MB) para WebP de
// 96px em app/public/item_icons/. O repositório do jogo é a única fonte desses
// ícones; o WebP mantém o alfa e derruba o peso para algo publicável.
//
// Precisa de sharp, que NAO e dependencia do app (so deste script):
//   cd app && npm i --no-save sharp
//
// Uso: node scripts/build-item-icons.mjs
import { readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'reference/savegame-editors/zelda-totk/assets/item_icons');
const OUT = join(ROOT, 'app/public/item_icons');
const SIZE = 96;

const categories = readdirSync(SRC).filter((n) => statSync(join(SRC, n)).isDirectory());
let count = 0;
let bytesIn = 0;
let bytesOut = 0;

for (const cat of categories) {
  mkdirSync(join(OUT, cat), { recursive: true });
  const files = readdirSync(join(SRC, cat)).filter((f) => f.endsWith('.png'));
  await Promise.all(
    files.map(async (f) => {
      const src = join(SRC, cat, f);
      const dst = join(OUT, cat, f.replace(/\.png$/, '.webp'));
      bytesIn += statSync(src).size;
      const info = await sharp(src).resize(SIZE, SIZE, { fit: 'inside' }).webp({ quality: 80 }).toFile(dst);
      bytesOut += info.size;
      count++;
    }),
  );
  console.log(`${cat}: ${files.length}`);
}

// Manifesto actorName -> categoria: sem ele o app teria que adivinhar a pasta
// (armadura vive em `armors`, item-chave em `key`) ou sondar 1039 URLs.
const manifest = {};
for (const cat of categories) {
  for (const f of readdirSync(join(OUT, cat))) {
    const key = f.replace(/\.webp$/, '');
    if (!(key in manifest)) manifest[key] = cat;
  }
}
writeFileSync(join(ROOT, 'app/public/data/item_icons.json'), JSON.stringify(manifest));
console.log(`manifesto: ${Object.keys(manifest).length} entradas`);

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(`\n${count} ícones  ${mb(bytesIn)} -> ${mb(bytesOut)}`);
