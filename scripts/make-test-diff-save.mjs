// Gera um save de teste com regressões controladas pra validar o diff de import:
// desfaz as 5 primeiras shrines do dataset e zera parte dos rupees.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(ROOT, 'fixtures/umar-save/slot_00/progress.sav')
const out = process.argv[2] ?? join(ROOT, 'app/public/demo/progress-test-diff.sav')
const data = JSON.parse(readFileSync(join(ROOT, 'reference/totk-100-live-map/docs/completion_data.json'), 'utf8'))

const buf = readFileSync(src)
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

const targets = new Map() // hash -> novo valor
const shrines = data.categories.find((c) => c.id === 'shrines')
for (const item of shrines.items.slice(0, 5)) targets.set(parseInt(item.value, 16), 0)
targets.set(0xa77921d7, 777) // PlayerStatus.CurrentRupee

let patched = 0
for (let off = 0x28; off < buf.length - 8; off += 8) {
  const hash = dv.getUint32(off, true)
  if (hash === 0xa3db7114) break
  if (targets.has(hash)) {
    dv.setUint32(off + 4, targets.get(hash), true)
    patched++
  }
}
writeFileSync(out, buf)
console.log(`patched ${patched}/${targets.size} flags -> ${out}`)
