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

/** "True 100%": média normalizada — cada grupo pesa igual */
export function overallFraction(groups: GroupProgress[]): number {
  if (groups.length === 0) return 0
  return groups.reduce((acc, g) => acc + (g.total ? g.done / g.total : 0), 0) / groups.length
}
