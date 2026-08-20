import { useEffect, useState } from 'react'

/**
 * Ícones reais de item (128px -> WebP 96px), extraídos do editor do
 * marcrobledo (ver reference/savegame-editors/zelda-totk/assets/item_icons,
 * gitignored — texturas do próprio jogo, créditos: Echocolat, Exincracci,
 * HylianLZ, Karlos007, ApacheThunder). Manifesto id -> pasta em
 * /data/item_icons.json, gerado por scripts/build-item-icons.mjs.
 */
let manifest: Record<string, string> | null = null
const listeners = new Set<() => void>()
const manifestPromise = fetch('/data/item_icons.json')
  .then((r) => r.json())
  .then((m) => {
    manifest = m
    listeners.forEach((fn) => fn())
  })
  .catch(() => {})
void manifestPromise

/** URL do ícone real pra um id de ator (actorName/fabricId/baseId/horse id), ou null se não houver. */
export function itemIconUrl(id: string | undefined | null): string | null {
  if (!id || !manifest) return null
  const cat = manifest[id]
  if (!cat) return null
  return `/item_icons/${cat}/${id}.webp`
}

/** true assim que o manifesto carrega — usado pra re-render após o fetch inicial. */
export function useItemIconsReady(): boolean {
  const [ready, setReady] = useState(!!manifest)
  useEffect(() => {
    if (manifest) return
    const fn = () => setReady(true)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  return ready
}
