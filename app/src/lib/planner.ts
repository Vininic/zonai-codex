import type { CompletionData } from './dataset'
import type { Progress, RouteStep } from '../store/appStore'
import { itemLabel } from './itemLabel'

/**
 * Planner determinístico da companion: vizinho-mais-próximo sobre os
 * pendentes das categorias escolhidas, numa camada, a partir da posição
 * do player (SavePos) ou do centro do mapa. Funciona 100% offline.
 */
export interface PlanOptions {
  categories: ReadonlySet<string>
  layer: string
  maxSteps: number
  origin: { x: number; z: number }
}

export function planRoute(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  opts: PlanOptions,
): RouteStep[] {
  const candidates: RouteStep[] = []
  for (const cat of data.categories) {
    if (!opts.categories.has(cat.id)) continue
    const m = manual[cat.id] ?? {}
    const s = fromSave[cat.id] ?? {}
    for (const item of cat.items) {
      if (m[item.id] || s[item.id]) continue
      if ((item.layer ?? 'surface') !== opts.layer) continue
      candidates.push({ groupId: cat.id, itemId: item.id, label: itemLabel(item), x: item.x, z: item.z, layer: opts.layer })
    }
  }

  const route: RouteStep[] = []
  let cur = opts.origin
  const pool = [...candidates]
  while (route.length < opts.maxSteps && pool.length > 0) {
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
    route.push(next)
    cur = next
  }
  return route
}

/** resumo compacto do progresso pro prompt da Purah */
export function progressBrief(data: CompletionData, manual: Progress, fromSave: Progress): string {
  const lines: string[] = []
  for (const group of [...data.categories, ...data.stats]) {
    const m = manual[group.id] ?? {}
    const s = fromSave[group.id] ?? {}
    const done = group.items.filter((i) => m[i.id] || s[i.id]).length
    if (done < group.items.length) lines.push(`${group.label}: ${done}/${group.items.length}`)
  }
  return lines.length ? lines.join('; ') : 'Everything complete!'
}
