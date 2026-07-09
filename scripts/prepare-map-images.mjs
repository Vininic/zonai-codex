// Converte os mapas do live-map (MIT) pra WebP mobile-friendly em app/public/map/
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, 'reference/totk-100-live-map/docs/assets')
const OUT = join(ROOT, 'app/public/map')
mkdirSync(OUT, { recursive: true })

const WIDTH = 4096

for (const layer of ['surface', 'sky', 'depths']) {
  const src = join(SRC, `${layer}.jpg`)
  const meta = await sharp(src).metadata()
  const out = join(OUT, `${layer}.webp`)
  const info = await sharp(src).resize({ width: WIDTH }).webp({ quality: 62 }).toFile(out)
  console.log(`${layer}: ${meta.width}x${meta.height} -> ${info.width}x${info.height}, ${(info.size / 1024 / 1024).toFixed(2)} MB`)
}
