/** murmur3_32 (seed 0) — hash usado nas chaves de GameData do TOTK. */
export function murmur3(str: string): number {
  const bytes = new TextEncoder().encode(str)
  let h = 0
  const c1 = 0xcc9e2d51
  const c2 = 0x1b873593
  const n = bytes.length & ~3
  for (let i = 0; i < n; i += 4) {
    let k = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
    k = Math.imul(k, c1)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, c2)
    h ^= k
    h = (h << 13) | (h >>> 19)
    h = (Math.imul(h, 5) + 0xe6546b64) | 0
  }
  const tail = bytes.length & 3
  if (tail > 0) {
    let k = 0
    if (tail === 3) k ^= bytes[n + 2] << 16
    if (tail >= 2) k ^= bytes[n + 1] << 8
    k ^= bytes[n]
    k = Math.imul(k, c1)
    k = (k << 15) | (k >>> 17)
    k = Math.imul(k, c2)
    h ^= k
  }
  h ^= bytes.length
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
