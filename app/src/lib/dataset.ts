/** Dataset de completion (fonte: TOTK-100-live-map, MIT — ver créditos). */

export type CategoryKind = 'bool' | 'guid' | 'seed'
export type StatKind =
  | 'reverse'
  | 'positive'
  | 'inventory_collection'
  | 'armor_inventory'
  | 'armor_upgraded'

export interface CategoryItem {
  id: string
  /** hash hex (bool/seed) ou u64 decimal (guid) */
  value: string
  x: number
  y: number
  z: number
  layer?: string
  note?: string
  /** koroks: 'hidden' | 'carry' | outros */
  kind?: string
  requires?: string[]
}

export interface Category {
  id: string
  label: string
  kind: CategoryKind
  targetValue: string | null
  defaultVisible: boolean
  items: CategoryItem[]
  sourceCounts?: Record<string, number>
}

export interface StatItem {
  id: string
  value: string
  label?: string
}

export interface Stat {
  id: string
  label: string
  kind: StatKind
  targetValue?: string | null
  includeMissing?: boolean
  items: StatItem[]
}

export interface CompletionData {
  categories: Category[]
  stats: Stat[]
}

let cache: Promise<CompletionData> | null = null

export function loadDataset(): Promise<CompletionData> {
  cache ??= fetch('/data/completion_data.json').then((r) => {
    if (!r.ok) throw new Error(`dataset fetch failed: ${r.status}`)
    return r.json() as Promise<CompletionData>
  })
  return cache
}
