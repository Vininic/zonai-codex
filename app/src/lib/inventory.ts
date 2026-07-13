import type { CompletionData, Stat, StatItem } from './dataset'
import { readString64Array, parseSave } from './saveParser'
import { getSessionSave } from './saveSession'
import type { Progress } from '../store/appStore'
import { classifyMaterial, type MaterialBucket } from './materialIcon'

/**
 * Leitura do pouch pra tab de Inventário: quantidade de materiais e estrelas
 * de armadura, direto do save da sessão (mesmo mecanismo do armorPlanner,
 * generalizado pra todos os itens de uma vez em vez de peça a peça).
 */

export interface MaterialEntry {
  id: string
  label: string
  bucket: MaterialBucket
  /** null = sem save na sessão (quantidade desconhecida); senão qtd efetiva (override se houver) */
  qty: number | null
  /** qtd real lida do save, antes de qualquer override do usuário */
  rawQty: number | null
  owned: boolean
  /** tem override de quantidade pendente (ainda não gravado no save) */
  staged: boolean
}

/** fabrics / fabrics_amiibo: kind 'positive', graváveis pelo editor v1 — a
 * única parte do Inventário com edição real hoje (ver saveWriter.ts). */
export interface ToggleableEntry {
  id: string
  groupId: string
  label: string
  owned: boolean
  /** marcado manualmente mas ainda não gravado no save */
  staged: boolean
  /** confirmado pelo save — não pode ser des/marcado (fonte de verdade é o arquivo) */
  locked: boolean
}

export interface KeyItemEntry {
  id: string
  label: string
  owned: boolean
  staged: boolean
  locked: boolean
}

export interface ArmorEntry {
  id: string
  label: string
  owned: boolean
  /** null = sem save na sessão (nível desconhecido) */
  stars: number | null
  staged: boolean
  locked: boolean
}

function materialStockByActor(data: CompletionData): Map<string, number> | null {
  const session = getSessionSave()
  if (!session) return null
  const upgraded = data.stats.find((s) => s.id === 'armor_upgraded') as
    | (Stat & { upgradeMaterials?: { materialStockArrayHash: string } })
    | undefined
  const stockHash = upgraded?.upgradeMaterials?.materialStockArrayHash
  const materialsStat = data.stats.find((s) => s.id === 'materials')
  if (!stockHash || !materialsStat?.arrayHash) return null

  const save = parseSave(session.buffer)
  const namesPtr = save.values.get(parseInt(materialsStat.arrayHash, 16))
  const stockPtr = save.values.get(parseInt(stockHash, 16))
  if (namesPtr === undefined || stockPtr === undefined) return null

  const names = readString64Array(save.buffer, namesPtr)
  const dv = new DataView(save.buffer)
  const count = dv.getUint32(stockPtr, true)
  const byActor = new Map<string, number>()
  for (let i = 0; i < Math.min(count, names.length); i++) {
    byActor.set(names[i], dv.getUint32(stockPtr + 4 + i * 4, true))
  }
  return byActor
}

export function buildMaterials(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  materialQty: Record<string, number> = {},
): MaterialEntry[] {
  const stat = data.stats.find((s) => s.id === 'materials')
  if (!stat) return []
  const stock = materialStockByActor(data)
  const m = manual.materials ?? {}
  const s = fromSave.materials ?? {}
  return stat.items.map((item) => {
    const rawQty = stock ? (stock.get(item.actorName ?? '') ?? 0) : null
    const override = materialQty[item.id]
    const staged = override !== undefined && override !== (rawQty ?? -1)
    return {
      id: item.id,
      label: item.label ?? item.id,
      bucket: classifyMaterial(item.actorName, item.label ?? item.id),
      qty: override ?? rawQty,
      rawQty,
      owned: !!(m[item.id] || s[item.id]),
      staged,
    }
  })
}

/** fabrics ou fabrics_amiibo: ambos kind 'positive', graváveis. */
export function buildToggleable(data: CompletionData, manual: Progress, fromSave: Progress, groupId: string): ToggleableEntry[] {
  const stat = data.stats.find((s) => s.id === groupId)
  if (!stat) return []
  const m = manual[groupId] ?? {}
  const s = fromSave[groupId] ?? {}
  return stat.items.map((item) => ({
    id: item.id,
    groupId,
    label: item.label ?? item.id,
    owned: !!(m[item.id] || s[item.id]),
    staged: !!m[item.id] && !s[item.id],
    locked: !!s[item.id],
  }))
}

export function buildKeyItems(data: CompletionData, manual: Progress, fromSave: Progress): KeyItemEntry[] {
  const stat = data.stats.find((s) => s.id === 'key_items')
  if (!stat) return []
  const m = manual.key_items ?? {}
  const s = fromSave.key_items ?? {}
  return stat.items.map((item) => ({
    id: item.id,
    label: item.label ?? item.id,
    owned: !!(m[item.id] || s[item.id]),
    staged: !!m[item.id] && !s[item.id],
    locked: !!s[item.id],
  }))
}

export function buildArmor(data: CompletionData, manual: Progress, fromSave: Progress): ArmorEntry[] {
  const stat = data.stats.find((s) => s.id === 'armor_inventory')
  if (!stat) return []
  const m = manual.armor_inventory ?? {}
  const s = fromSave.armor_inventory ?? {}
  const fallback = () =>
    stat.items.map((item) => ({
      id: item.id,
      label: item.label ?? item.id,
      owned: !!(m[item.id] || s[item.id]),
      stars: null,
      staged: !!m[item.id] && !s[item.id],
      locked: !!s[item.id],
    }))

  const session = getSessionSave()
  if (!session || !stat.arrayHash) return fallback()
  const save = parseSave(session.buffer)
  const ptr = save.values.get(parseInt(stat.arrayHash, 16))
  const pouch = new Set(readString64Array(save.buffer, ptr))

  return (stat.items as (StatItem & { levels?: { id: string; stars: number }[] })[]).map((item) => {
    const ownedInSave = (item.ids ?? []).some((id) => pouch.has(id))
    let stars = 0
    for (const lvl of item.levels ?? []) if (pouch.has(lvl.id)) stars = Math.max(stars, lvl.stars)
    const owned = ownedInSave || !!m[item.id]
    return {
      id: item.id,
      label: item.label ?? item.id,
      owned,
      stars: ownedInSave ? stars : null,
      staged: !!m[item.id] && !ownedInSave,
      locked: ownedInSave,
    }
  })
}
