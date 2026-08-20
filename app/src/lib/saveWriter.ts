import { CLEAR_HASH, META_SAVE_TYPE, type PlayerStats } from './saveParser'
import { murmur3 } from './murmur3'
import type { CompletionData, Category, Stat, StatItem } from './dataset'
import type { EquipmentGrant, PlayerEdits as PlayerEditsType, Progress } from '../store/appStore'
import { equipArrays, modifierHash } from './equipment'
import { buildEponaGrant, horseFieldHash } from './horse'

/**
 * Editor v1 (§3.5 do plano): grava flags escalares no buffer clonado.
 * Editor v2 (2026-07-12): grava também nos arrays do pouch (materials,
 * key_items, armor_inventory/armor_upgraded) — ver `arrayWrites` abaixo.
 * Os arrays têm capacidade fixa MAIOR que o normalmente usado (ex.: materials
 * tem 510 slots pra 251 tipos conhecidos), com slots vazios sobrando no fim
 * (nome="" + sentinela 0xFFFFFFFF no stock). Escrever num slot vazio não
 * move nenhum outro byte do arquivo — validado byte-a-byte em
 * scripts/spike-write-pouch.mjs contra um save real. Fora do v2: guid
 * (bubbulfrogs/hudson/sage's will) e reverse (compendium).
 */

export const WRITABLE_CATEGORY_KINDS = new Set(['bool', 'seed'])
export const WRITABLE_STAT_KINDS = new Set(['positive', 'inventory_collection', 'armor_inventory', 'armor_upgraded'])
/** kinds cujo write precisa inspecionar o array do pouch (não é escalar simples) */
const ARRAY_STAT_KINDS = new Set(['inventory_collection', 'armor_inventory', 'armor_upgraded'])

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

export type { PlayerEdits } from '../store/appStore'

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

export interface ArrayWrite {
  /** ponteiro (offset absoluto) do array String64 de nomes */
  namesPtr: number
  /** índice do slot — vazio (grant novo) ou já ocupado (troca de tier de armadura) */
  index: number
  actorName: string
  /** ponteiro do array paralelo de estoque u32 (só materials) */
  stockPtr?: number
  stockValue?: number
  /** arrays u32 paralelos indexados pelo mesmo slot (durabilidade, modificador
   *  e valor do modificador, no caso de equipamento; stats/cor, no de cavalo) */
  ints?: { ptr: number; value: number }[]
  /** WString16Array (32 bytes/entrada, UTF-16) — nome de cavalo */
  wstrings?: { ptr: number; value: string }[]
  /** campo float de 32 bits (laço do cavalo) */
  floats?: { ptr: number; value: number }[]
  /** BoolArray: 1 bit por entrada, não 4 bytes (familiaridade conferida) */
  bits?: { ptr: number; value: boolean }[]
}

export interface EditPlan {
  /** hash -> novo valor (tabela escalar) */
  writes: Map<number, number>
  /** escritas nos arrays do pouch (materials/key_items/armor) */
  arrayWrites: ArrayWrite[]
  itemCount: number
  /**
   * Itens staged que este save NÃO consegue receber: a flag não existe na
   * tabela de hashes do arquivo. O writer só altera entradas existentes — criar
   * uma mudaria o tamanho/layout do save. Acontece de verdade: num save real
   * v1.1.x, os 5 tecidos dos Sábios não tinham entrada, então "conceder" os 29
   * amiibo gravava só 24. Sem esta lista o editor perdia 5 em silêncio.
   */
  skipped: { groupId: string; itemId: string }[]
}

/** lê um array String64 preservando índice (slots vazios viram '', diferente de saveParser.readString64Array) */
function readString64Raw(buffer: ArrayBuffer, pointer: number): string[] {
  const dv = new DataView(buffer)
  const count = dv.getUint32(pointer, true)
  const start = pointer + 4
  const bytes = new Uint8Array(buffer)
  const decoder = new TextDecoder()
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const slice = bytes.subarray(start + i * 64, start + (i + 1) * 64)
    const nul = slice.indexOf(0)
    out.push(decoder.decode(nul === -1 ? slice : slice.subarray(0, nul)).trim())
  }
  return out
}

function findEmptySlot(names: string[], claimed: Set<number>): number {
  for (let i = 0; i < names.length; i++) if (names[i] === '' && !claimed.has(i)) return i
  return -1
}

/** planeja as escritas de array pra um item de kind inventory_collection/armor_inventory/armor_upgraded */
function arrayWritesForItem(
  data: CompletionData,
  group: Stat,
  itemId: string,
  buffer: ArrayBuffer,
  values: Map<number, number>,
  claimed: Set<number>,
): ArrayWrite[] {
  const item = group.items.find((i) => i.id === itemId)
  if (!item) return []

  if (group.kind === 'inventory_collection') {
    if (!item.actorName || !group.arrayHash) return []
    const namesPtr = values.get(parseInt(group.arrayHash, 16))
    if (namesPtr === undefined) return []
    const names = readString64Raw(buffer, namesPtr)
    if (names.includes(item.actorName)) return [] // já presente, nada a fazer
    const idx = findEmptySlot(names, claimed)
    if (idx === -1) return [] // sem capacidade sobrando (não deveria acontecer, ver NOTES.md)
    claimed.add(idx)
    const write: ArrayWrite = { namesPtr, index: idx, actorName: item.actorName }
    if (group.id === 'materials') {
      const upgraded = data.stats.find((s) => s.id === 'armor_upgraded') as
        | (Stat & { upgradeMaterials?: { materialStockArrayHash: string } })
        | undefined
      const stockHash = upgraded?.upgradeMaterials?.materialStockArrayHash
      if (stockHash) {
        write.stockPtr = values.get(parseInt(stockHash, 16))
        write.stockValue = 1
      }
    }
    return [write]
  }

  // armor_inventory / armor_upgraded: presença de um id específico no mesmo array (754e8549)
  const armorInv = data.stats.find((s) => s.id === 'armor_inventory')
  if (!armorInv?.arrayHash) return []
  const namesPtr = values.get(parseInt(armorInv.arrayHash, 16))
  if (namesPtr === undefined) return []
  const names = readString64Raw(buffer, namesPtr)

  const targetId =
    group.kind === 'armor_upgraded'
      ? ((item as StatItem & { upgradedId?: string }).upgradedId ?? (item as StatItem & { upgradedIds?: string[] }).upgradedIds?.[0])
      : (item as StatItem & { ids?: string[] }).ids?.[0]
  if (!targetId) return []
  if (names.includes(targetId)) return [] // já no tier desejado

  // baseId comum entre armor_inventory/armor_upgraded identifica a mesma peça —
  // se ela já ocupa algum slot (tier menor), a troca de tier sobrescreve esse
  // slot em vez de gastar capacidade nova
  const baseId = (item as StatItem & { baseId?: string }).baseId
  const invItem = armorInv.items.find((i) => (i as StatItem & { baseId?: string }).baseId === baseId) as
    | (StatItem & { ids?: string[] })
    | undefined
  const pieceIds = invItem?.ids ?? []
  const currentIdx = names.findIndex((n) => pieceIds.includes(n))

  const idx = currentIdx !== -1 ? currentIdx : findEmptySlot(names, claimed)
  if (idx === -1) return []
  claimed.add(idx)
  return [{ namesPtr, index: idx, actorName: targetId }]
}

export interface MaterialQtyEdit {
  itemId: string
  qty: number
}

export function buildEditPlan(
  data: CompletionData,
  staged: StagedGroup[],
  selectedGroups: ReadonlySet<string>,
  playerEdits: PlayerEditsType,
  currentPlayer: PlayerStats | null,
  buffer: ArrayBuffer | null = null,
  values: Map<number, number> | null = null,
  materialQtyEdits: MaterialQtyEdit[] = [],
  equipmentGrants: EquipmentGrant[] = [],
  grantEpona = false,
): EditPlan {
  const writes = new Map<number, number>()
  const arrayWrites: ArrayWrite[] = []
  const claimed = new Set<number>()
  const skipped: { groupId: string; itemId: string }[] = []
  let itemCount = 0
  for (const sg of staged) {
    if (!sg.writable || !selectedGroups.has(sg.groupId)) continue
    const group = data.categories.find((c) => c.id === sg.groupId) ?? data.stats.find((s) => s.id === sg.groupId)
    if (!group) continue
    if (ARRAY_STAT_KINDS.has(group.kind)) {
      if (!buffer || !values) continue
      for (const itemId of sg.itemIds) {
        const aw = arrayWritesForItem(data, group as Stat, itemId, buffer, values, claimed)
        if (aw.length) itemCount++
        arrayWrites.push(...aw)
      }
      continue
    }
    for (const itemId of sg.itemIds) {
      const w = writesForItem(group, itemId)
      // se a flag principal não existe na tabela deste save, applyEdits não tem
      // onde escrever — registra como pulado em vez de sumir com ela
      const primary = [...w.keys()][0]
      if (values && primary !== undefined && !values.has(primary)) {
        skipped.push({ groupId: sg.groupId, itemId })
        continue
      }
      if (w.size) itemCount++
      for (const [h, v] of w) writes.set(h, v)
    }
  }

  if (buffer && values && materialQtyEdits.length) {
    const materialsStat = data.stats.find((s) => s.id === 'materials')
    const upgraded = data.stats.find((s) => s.id === 'armor_upgraded') as
      | (Stat & { upgradeMaterials?: { materialStockArrayHash: string } })
      | undefined
    const stockHash = upgraded?.upgradeMaterials?.materialStockArrayHash
    if (materialsStat?.arrayHash && stockHash) {
      const namesPtr = values.get(parseInt(materialsStat.arrayHash, 16))
      const stockPtr = values.get(parseInt(stockHash, 16))
      if (namesPtr !== undefined && stockPtr !== undefined) {
        const names = readString64Raw(buffer, namesPtr)
        for (const edit of materialQtyEdits) {
          const item = materialsStat.items.find((i) => i.id === edit.itemId)
          if (!item?.actorName) continue
          const qty = Math.max(0, Math.min(999, Math.round(edit.qty)))
          let idx = names.indexOf(item.actorName)
          if (idx === -1) {
            idx = findEmptySlot(names, claimed)
            if (idx === -1) continue
            claimed.add(idx)
            names[idx] = item.actorName // reserva localmente pra não colidir com outro edit nesta mesma passada
            arrayWrites.push({ namesPtr, index: idx, actorName: item.actorName, stockPtr, stockValue: qty })
          } else {
            arrayWrites.push({ namesPtr, index: idx, actorName: item.actorName, stockPtr, stockValue: qty })
          }
          itemCount++
        }
      }
    }
  }

  // equipamento: cada grant ocupa um slot vazio do pouch da categoria e grava
  // nome + durabilidade + modificador (hash) + valor do modificador
  if (buffer && values && equipmentGrants.length) {
    const claimedByCat = new Map<string, Set<number>>()
    for (const grant of equipmentGrants) {
      const arrays = equipArrays(values, grant.category, buffer)
      if (!arrays) continue
      const used = claimedByCat.get(grant.category) ?? new Set<number>()
      claimedByCat.set(grant.category, used)

      const names = readString64Raw(buffer, arrays.namePtr)
      let idx = -1
      for (let i = 0; i < names.length; i++) {
        if (names[i] === '' && !used.has(i)) {
          idx = i
          break
        }
      }
      if (idx === -1) continue // pouch cheio: nada a fazer, e nada é sobrescrito
      used.add(idx)
      arrayWrites.push({
        namesPtr: arrays.namePtr,
        index: idx,
        actorName: grant.id,
        ints: [
          { ptr: arrays.lifePtr, value: Math.max(1, Math.round(grant.durability)) },
          { ptr: arrays.effectTypePtr, value: modifierHash(grant.modifier) },
          { ptr: arrays.effectValuePtr, value: grant.modifier === 'None' ? 0 : Math.max(0, Math.round(grant.modifierValue)) },
        ],
      })
      itemCount++
    }
  }

  // Epona: exclusiva de amiibo, sem forma normal de obter no jogo — grava
  // num slot livre de OwnedHorseList com os valores padrão do amiibo real
  // (mane/saddle/reins/stats/cor), igual Horse.DEFAULT_VALUES.GameRomHorseEpona
  // no editor de referência.
  if (buffer && values && grantEpona) {
    const namesPtr = values.get(horseFieldHash('ActorName'))
    if (namesPtr !== undefined) {
      const names = readString64Raw(buffer, namesPtr)
      const alreadyHas = names.includes('GameRomHorseEpona')
      const idx = alreadyHas ? -1 : findEmptySlot(names, claimed)
      if (idx !== -1) {
        claimed.add(idx)
        const grant = buildEponaGrant(idx)
        const ints = Object.entries(grant.ints)
          .map(([field, value]) => {
            const ptr = values.get(horseFieldHash(field))
            return ptr === undefined ? null : { ptr, value }
          })
          .filter((x): x is { ptr: number; value: number } => x !== null)
        const wnamePtr = values.get(horseFieldHash('Name'))
        const bondPtr = values.get(horseFieldHash('Familiarity'))
        const bondCheckedPtr = values.get(horseFieldHash('IsFamiliarityChecked'))
        arrayWrites.push({
          namesPtr,
          index: idx,
          actorName: 'GameRomHorseEpona',
          ints,
          wstrings: wnamePtr !== undefined ? [{ ptr: wnamePtr, value: grant.name }] : [],
          floats: bondPtr !== undefined ? [{ ptr: bondPtr, value: grant.bond }] : [],
          bits: bondCheckedPtr !== undefined ? [{ ptr: bondCheckedPtr, value: grant.bondChecked }] : [],
        })
        itemCount++
      }
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
  return { writes, arrayWrites, itemCount, skipped }
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
  for (const aw of plan.arrayWrites) {
    const slotStart = aw.namesPtr + 4 + aw.index * 64
    const bytes = new Uint8Array(buffer, slotStart, 64)
    bytes.fill(0)
    bytes.set(new TextEncoder().encode(aw.actorName))
    if (aw.stockPtr !== undefined && aw.stockValue !== undefined) {
      dv.setUint32(aw.stockPtr + 4 + aw.index * 4, aw.stockValue, true)
    }
    for (const { ptr, value } of aw.ints ?? []) {
      dv.setUint32(ptr + 4 + aw.index * 4, value >>> 0, true)
    }
    for (const { ptr, value } of aw.wstrings ?? []) {
      const start = ptr + 4 + aw.index * 0x20
      const wbytes = new Uint8Array(buffer, start, 0x20)
      wbytes.fill(0)
      for (let i = 0; i < Math.min(value.length, 9); i++) dv.setUint16(start + i * 2, value.charCodeAt(i), true)
    }
    for (const { ptr, value } of aw.floats ?? []) {
      dv.setFloat32(ptr + 4 + aw.index * 4, value, true)
    }
    for (const { ptr, value } of aw.bits ?? []) {
      const byteOff = ptr + 4 + Math.floor(aw.index / 8)
      const bit = 1 << (aw.index % 8)
      const cur = dv.getUint8(byteOff)
      dv.setUint8(byteOff, value ? (cur | bit) : (cur & ~bit) & 0xff)
    }
    applied++
  }
  return { buffer, applied }
}
