import type { CompletionData } from './dataset'
import type { Progress, RouteStep } from '../store/appStore'
import { itemLabel } from './itemLabel'
import { inRegion, regionCenter, type Region } from './regions'

/**
 * Plano de "limpar região": um passo por categoria pendente dentro da box,
 * rota contínua A→B→C encadeada entre passos (vizinho-mais-próximo).
 * Determinístico — a IA só narra.
 */

export interface RegionFlowStep {
  categoryId: string
  /** itens que entram na rota (ordenados) */
  items: RouteStep[]
  /** pendentes além dos roteados */
  extraCount: number
  pendingTotal: number
}

export interface RegionPlan {
  regionId: string
  regionName: string
  totalPending: number
  steps: RegionFlowStep[]
  /** rota achatada A→B→C de todos os passos (cap global) */
  route: RouteStep[]
}

/** ordem natural de limpeza: torres revelam, depois descobertas, depois coleta fina */
const STEP_ORDER = [
  'towers',
  'shrines',
  'lightroots',
  'caves',
  'bubbulfrogs',
  'wells',
  'chasms',
  'shrine_chests',
  'hudson_sign',
  'hinox',
  'stone_talus',
  'molduga',
  'frox',
  'flux_construct',
  'gleeok',
  'dungeon_bosses',
  'schema_stone',
  'yiga_schematic',
  'old_map',
  'armor',
  'sage_will',
  'koroks',
  'general_locations',
]

const PER_STEP_CAP = 8
const ROUTE_CAP = 36

export function buildRegionPlan(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  region: Region,
  playerPos: { x: number; z: number } | null,
): RegionPlan {
  const order = new Map(STEP_ORDER.map((id, i) => [id, i]))
  const cats = [...data.categories].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))

  const steps: RegionFlowStep[] = []
  const route: RouteStep[] = []
  let cursor = playerPos && inRegion(region, playerPos.x, playerPos.z) ? playerPos : regionCenter(region)
  let totalPending = 0

  for (const cat of cats) {
    const m = manual[cat.id] ?? {}
    const s = fromSave[cat.id] ?? {}
    const pending: RouteStep[] = []
    for (const item of cat.items) {
      if (m[item.id] || s[item.id]) continue
      if (!inRegion(region, item.x, item.z)) continue
      pending.push({
        groupId: cat.id,
        itemId: item.id,
        label: itemLabel(item),
        x: item.x,
        z: item.z,
        layer: item.layer ?? 'surface',
      })
    }
    if (pending.length === 0) continue
    totalPending += pending.length

    // encadeia por proximidade a partir do fim da rota anterior
    const cap = Math.min(PER_STEP_CAP, Math.max(0, ROUTE_CAP - route.length))
    const chosen: RouteStep[] = []
    const pool = [...pending]
    let cur = cursor
    while (chosen.length < cap && pool.length > 0) {
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < pool.length; i++) {
        const d = (pool[i].x - cur.x) ** 2 + (pool[i].z - cur.z) ** 2
        if (d < bestDist) {
          bestDist = d
          bestIdx = i
        }
      }
      const next = pool.splice(bestIdx, 1)[0]
      chosen.push(next)
      cur = next
    }
    if (chosen.length > 0) cursor = chosen[chosen.length - 1]

    steps.push({ categoryId: cat.id, items: chosen, extraCount: pending.length - chosen.length, pendingTotal: pending.length })
    route.push(...chosen)
  }

  return { regionId: region.id, regionName: region.name, totalPending, steps, route }
}
