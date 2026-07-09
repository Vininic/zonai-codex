import { createContext, useContext } from 'react'
import type { CompletionData } from './dataset'
import { SUPPORTED_STAT_KINDS } from './completion'
import type { Progress } from '../store/appStore'

export const DatasetContext = createContext<CompletionData | null>(null)

export function useDataset(): CompletionData {
  const data = useContext(DatasetContext)
  if (!data) throw new Error('DatasetContext missing')
  return data
}

export interface GroupProgress {
  id: string
  label: string
  done: number
  total: number
  isMarkerCategory: boolean
  /** stat cujo estado ainda não é lido do save (só manual) */
  saveSupported: boolean
}

export function countDone(manual: Progress, fromSave: Progress, groupId: string, itemIds: { id: string }[]): number {
  const m = manual[groupId] ?? {}
  const s = fromSave[groupId] ?? {}
  let done = 0
  for (const item of itemIds) if (m[item.id] || s[item.id]) done++
  return done
}

export function computeProgress(data: CompletionData, manual: Progress, fromSave: Progress): GroupProgress[] {
  const groups: GroupProgress[] = []
  for (const cat of data.categories) {
    groups.push({
      id: cat.id,
      label: cat.label,
      done: countDone(manual, fromSave, cat.id, cat.items),
      total: cat.items.length,
      isMarkerCategory: true,
      saveSupported: true,
    })
  }
  for (const stat of data.stats) {
    groups.push({
      id: stat.id,
      label: stat.label,
      done: countDone(manual, fromSave, stat.id, stat.items),
      total: stat.items.length,
      isMarkerCategory: false,
      saveSupported: SUPPORTED_STAT_KINDS.has(stat.kind),
    })
  }
  return groups
}

/** "True 100%": média normalizada — cada grupo pesa igual; respeita exclusões do usuário */
export function overallFraction(groups: GroupProgress[], excluded: Record<string, 1> = {}): number {
  const active = groups.filter((g) => !excluded[g.id])
  if (active.length === 0) return 0
  return active.reduce((acc, g) => acc + (g.total ? g.done / g.total : 0), 0) / active.length
}

/**
 * Grupos que compõem o contador de mapa do próprio jogo (aproximação:
 * o jogo conta cavernas 1×, nosso dataset conta entradas; dispensers faltam).
 */
export const MAP_PERCENT_GROUPS = new Set([
  'general_locations',
  'shrines',
  'lightroots',
  'towers',
  'caves',
  'wells',
  'chasms',
])

/** "Map %": contagem bruta (cada descoberta vale 1), como no jogo */
export function mapFraction(groups: GroupProgress[]): number {
  let done = 0
  let total = 0
  for (const g of groups) {
    if (!MAP_PERCENT_GROUPS.has(g.id)) continue
    done += g.done
    total += g.total
  }
  return total ? done / total : 0
}
