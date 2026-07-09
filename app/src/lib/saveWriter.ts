import { CLEAR_HASH, META_SAVE_TYPE, type PlayerStats } from './saveParser'
import { murmur3 } from './murmur3'
import type { CompletionData, Category, Stat } from './dataset'
import type { Progress } from '../store/appStore'

/**
 * Editor v1 (§3.5 do plano): grava flags escalares no buffer clonado.
 * Suportado: categorias bool/seed, stats positive, player (rupees/corações/
 * stamina/bateria). Fora do v1: guid (bubbulfrogs/hudson/sage's will),
 * reverse (compendium) e inventário (pouch) — exigem escrita estrutural.
 */

export const WRITABLE_CATEGORY_KINDS = new Set(['bool', 'seed'])
export const WRITABLE_STAT_KINDS = new Set(['positive'])

export interface StagedGroup {
  groupId: string
  label: string
  itemIds: string[]
  writable: boolean
}

/** marcas manuais à frente do save, agrupadas — as staged changes do editor */
export function computeStaged(data: CompletionData, manual: Progress, fromSave: Progress): StagedGroup[] {
  const staged: StagedGroup[] = []
  const collect = (group: Category | Stat, writable: boolean) => {
    const m = manual[group.id] ?? {}
    const s = fromSave[group.id] ?? {}
    const itemIds = group.items.filter((i) => m[i.id] && !s[i.id]).map((i) => i.id)
    if (itemIds.length) staged.push({ groupId: group.id, label: group.label, itemIds, writable })
  }
  for (const cat of data.categories) collect(cat, WRITABLE_CATEGORY_KINDS.has(cat.kind))
  for (const stat of data.stats) collect(stat, WRITABLE_STAT_KINDS.has(stat.kind))
  return staged
}

export interface PlayerEdits {
  rupees?: number
  hearts?: number
  staminaWheels?: number
  batteryCells?: number
}

const H_RUPEES = murmur3('PlayerStatus.CurrentRupee')
const H_MAX_LIFE = murmur3('PlayerStatus.MaxLife')
const H_MAX_STAMINA = murmur3('PlayerStatus.MaxStamina')
const H_MAX_ENERGY = murmur3('PlayerStatus.MaxEnergy')

function f32Bits(value: number): number {
  const dv = new DataView(new ArrayBuffer(4))
  dv.setFloat32(0, value, true)
  return dv.getUint32(0, true)
}

/** hash -> valor u32 a gravar para um item staged */
function writesForItem(group: Category | Stat, itemId: string): Map<number, number> {
  const writes = new Map<number, number>()
  const item = group.items.find((i) => i.id === itemId)
  if (!item || !item.value) return writes
  const hash = parseInt(item.value, 16)
  if (group.kind === 'seed') {
    writes.set(hash, (item as Category['items'][number]).kind === 'hidden' ? 1 : CLEAR_HASH)
  } else if ('targetValue' in group && group.targetValue) {
    writes.set(hash, parseInt(group.targetValue, 16))
  } else {
    writes.set(hash, 1)
  }
  const requires = (item as { requires?: string[] }).requires ?? []
  for (const r of requires) writes.set(parseInt(r, 16), 1)
  return writes
}

export interface EditPlan {
  /** hash -> novo valor */
  writes: Map<number, number>
  itemCount: number
}

export function buildEditPlan(
  data: CompletionData,
  staged: StagedGroup[],
  selectedGroups: ReadonlySet<string>,
  playerEdits: PlayerEdits,
  currentPlayer: PlayerStats | null,
): EditPlan {
  const writes = new Map<number, number>()
  let itemCount = 0
  for (const sg of staged) {
    if (!sg.writable || !selectedGroups.has(sg.groupId)) continue
    const group = data.categories.find((c) => c.id === sg.groupId) ?? data.stats.find((s) => s.id === sg.groupId)
    if (!group) continue
    for (const itemId of sg.itemIds) {
      const w = writesForItem(group, itemId)
      if (w.size) itemCount++
      for (const [h, v] of w) writes.set(h, v)
    }
  }
  const p = currentPlayer
  if (playerEdits.rupees !== undefined && playerEdits.rupees !== p?.rupees)
    writes.set(H_RUPEES, Math.max(0, Math.min(999999, Math.round(playerEdits.rupees))))
  if (playerEdits.hearts !== undefined && playerEdits.hearts !== p?.hearts)
    writes.set(H_MAX_LIFE, Math.max(4, Math.min(160, Math.round(playerEdits.hearts * 4))))
  if (playerEdits.staminaWheels !== undefined && playerEdits.staminaWheels !== p?.staminaWheels)
    writes.set(H_MAX_STAMINA, f32Bits(Math.max(1, Math.min(3, playerEdits.staminaWheels)) * 1000))
  if (playerEdits.batteryCells !== undefined && playerEdits.batteryCells !== p?.batteryCells)
    writes.set(H_MAX_ENERGY, f32Bits(Math.max(0, Math.min(48, playerEdits.batteryCells)) * 1000))
  return { writes, itemCount }
}

/** aplica o plano num clone do buffer original e devolve o novo save */
export function applyEdits(original: ArrayBuffer, plan: EditPlan): { buffer: ArrayBuffer; applied: number } {
  const buffer = original.slice(0)
  const dv = new DataView(buffer)
  let applied = 0
  for (let off = 0x28; off < buffer.byteLength - 8; off += 8) {
    const hash = dv.getUint32(off, true)
    if (hash === META_SAVE_TYPE) break
    const value = plan.writes.get(hash)
    if (value !== undefined) {
      dv.setUint32(off + 4, value, true)
      applied++
    }
  }
  return { buffer, applied }
}
