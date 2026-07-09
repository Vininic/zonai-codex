import { CLEAR_HASH, readString64Array, type ParsedSave } from './saveParser'
import { murmur3 } from './murmur3'
import type { Category, CompletionData, Stat } from './dataset'

/**
 * Avaliação de "obtido" por kind — semântica portada do TOTK-100-live-map
 * (validada contra save ~100% em scripts/spike-parse-save.mjs).
 */

function targetRaw(def: { targetValue?: string | null }): number | null {
  return def.targetValue ? parseInt(def.targetValue, 16) : null
}

function isRawObtained(def: { kind: string; targetValue?: string | null }, raw: number): boolean {
  const target = targetRaw(def)
  if (def.kind === 'reverse' && target !== null) return raw !== target
  if (target !== null) return raw === target
  return raw !== 0
}

export function isCategoryItemDone(
  category: Category,
  item: Category['items'][number],
  save: ParsedSave,
): boolean {
  if (category.kind === 'guid') return save.guids.has(BigInt(item.value))
  const raw = save.values.get(parseInt(item.value, 16)) ?? 0
  if (category.kind === 'seed') {
    return item.kind === 'hidden' ? raw !== 0 : raw === CLEAR_HASH
  }
  return (
    isRawObtained(category, raw) &&
    (item.requires ?? []).every((r) => (save.values.get(parseInt(r, 16)) ?? 0) !== 0)
  )
}

export function isStatItemDone(stat: Stat, item: Stat['items'][number], save: ParsedSave): boolean {
  const raw = save.values.get(parseInt(item.value ?? '0', 16)) ?? 0
  return isRawObtained(stat, raw)
}

/** todos os kinds de stat são lidos do save (inventário via arrays do pouch) */
export const SUPPORTED_STAT_KINDS = new Set([
  'positive',
  'reverse',
  'inventory_collection',
  'armor_inventory',
  'armor_upgraded',
])

// Travel Medallion: o pouch de key items não repete Obj_WarpDLC por slot;
// a posse completa segue o enum da quest Step_GetWarpMarker (>= 7)
const TRAVEL_MEDALLION_ACTOR = 'Obj_WarpDLC'
const H_WARP_MARKER_STEP = murmur3('Step_GetWarpMarker')
const WARP_MARKER_FINAL_STEP = 7

function pouchNames(stat: Stat, save: ParsedSave): Set<string> {
  const pointer = stat.arrayHash ? save.values.get(parseInt(stat.arrayHash, 16)) : undefined
  return new Set(readString64Array(save.buffer, pointer))
}

function evaluateInventoryStat(stat: Stat, save: ParsedSave): Set<string> {
  const pouch = pouchNames(stat, save)
  const done = new Set<string>()
  for (const item of stat.items) {
    let obtained: boolean
    if (stat.kind === 'armor_inventory') {
      obtained = (item.ids ?? []).some((id) => pouch.has(id))
    } else if (stat.kind === 'armor_upgraded') {
      const ids = item.upgradedIds ?? (item.upgradedId ? [item.upgradedId] : [])
      obtained = ids.some((id) => pouch.has(id))
    } else {
      obtained = !!item.actorName && pouch.has(item.actorName)
      if (obtained && item.actorName === TRAVEL_MEDALLION_ACTOR) {
        obtained = (save.values.get(H_WARP_MARKER_STEP) ?? 0) >= WARP_MARKER_FINAL_STEP
      }
    }
    if (obtained) done.add(item.id)
  }
  return done
}

/** ids (categoria ou stat) -> ids de itens concluídos segundo o save */
export function evaluateSave(data: CompletionData, save: ParsedSave): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const cat of data.categories) {
    const done = new Set<string>()
    for (const item of cat.items) if (isCategoryItemDone(cat, item, save)) done.add(item.id)
    result.set(cat.id, done)
  }
  for (const stat of data.stats) {
    if (stat.kind === 'inventory_collection' || stat.kind === 'armor_inventory' || stat.kind === 'armor_upgraded') {
      result.set(stat.id, evaluateInventoryStat(stat, save))
      continue
    }
    if (!SUPPORTED_STAT_KINDS.has(stat.kind)) continue
    const done = new Set<string>()
    for (const item of stat.items) if (isStatItemDone(stat, item, save)) done.add(item.id)
    result.set(stat.id, done)
  }
  return result
}

/** sementes korok: markers 'carry' valem 2 */
export function korokSeeds(category: Category, doneIds: ReadonlySet<string>): number {
  let seeds = 0
  for (const item of category.items) {
    if (doneIds.has(item.id)) seeds += item.kind === 'carry' ? 2 : 1
  }
  return seeds
}
