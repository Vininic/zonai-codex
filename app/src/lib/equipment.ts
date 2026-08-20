import { murmur3 } from './murmur3'
import { parseSave } from './saveParser'
import { getSessionSave } from './saveSession'

/**
 * Pouch de equipamento (arcos / armas / escudos).
 *
 * Formato confirmado contra o savegame-editor do Marc Robledo (MIT) e validado
 * lendo um save real: cada categoria é um punhado de arrays PARALELOS, todos
 * indexados pelo mesmo slot —
 *
 *   Pouch.Bow.Content.Name          String64Array  (64 bytes por entrada)
 *   Pouch.Bow.Content.Life          IntArray       (4 bytes)
 *   Pouch.Bow.Content.Effect.Type   EnumArray      (4 bytes, murmur3 do nome)
 *   Pouch.Bow.Content.Effect.Value  IntArray       (4 bytes)
 *
 * Todo array é `u32 count` seguido das entradas — o mesmo layout dos materiais.
 * O detalhe que não é óbvio: **enum é gravado como o hash murmur3 do nome**,
 * não como índice; por isso `modifierHash()` em vez de uma tabela de inteiros.
 */

export type EquipCategory = 'bows' | 'weapons' | 'shields'

/** ordem importa só pra UI; o valor gravado é sempre o hash do nome */
export const MODIFIERS: Record<EquipCategory, string[]> = {
  bows: ['None', 'AttackUp', 'AttackUpPlus', 'DurabilityUp', 'DurabilityUpPlus', 'RapidFire', 'FiveWay'],
  weapons: ['None', 'AttackUp', 'AttackUpPlus', 'DurabilityUp', 'DurabilityUpPlus', 'FinishBlow', 'LongThrow'],
  shields: ['None', 'DurabilityUp', 'DurabilityUpPlus', 'GuardUp', 'GuardUpPlus'],
}

const PREFIX: Record<EquipCategory, string> = {
  bows: 'Pouch.Bow',
  weapons: 'Pouch.Weapon',
  shields: 'Pouch.Shield',
}

export const modifierHash = (name: string) => murmur3(name)

/** hash → nome, pra decodificar o que já está no save */
const reverseModifier = (cat: EquipCategory, raw: number): string => {
  for (const name of MODIFIERS[cat]) if (murmur3(name) === (raw >>> 0)) return name
  return raw === 0 ? 'None' : `0x${(raw >>> 0).toString(16)}`
}

export interface EquipArrays {
  namePtr: number
  lifePtr: number
  effectTypePtr: number
  effectValuePtr: number
  capacity: number
}

export interface EquipSlot {
  index: number
  id: string
  durability: number
  modifier: string
  modifierValue: number
}

export interface EquipPouch {
  category: EquipCategory
  arrays: EquipArrays
  /** só os slots ocupados, na ordem do save (= ordem do menu do jogo) */
  slots: EquipSlot[]
  capacity: number
  /** índices de slots vazios, disponíveis pra receber item novo */
  freeIndices: number[]
}

export interface EquipCatalogItem {
  id: string
  label: string
  durability: number
}
export type EquipCatalog = Record<EquipCategory, EquipCatalogItem[]>

let catalogCache: Promise<EquipCatalog> | null = null
export function loadEquipmentCatalog(): Promise<EquipCatalog> {
  catalogCache ??= fetch('/data/equipment.json').then((r) => {
    if (!r.ok) throw new Error(`equipment.json: ${r.status}`)
    return r.json() as Promise<EquipCatalog>
  })
  return catalogCache
}

/** localiza os 4 arrays paralelos da categoria dentro do save */
export function equipArrays(values: Map<number, number>, cat: EquipCategory, buffer: ArrayBuffer): EquipArrays | null {
  const p = PREFIX[cat]
  const namePtr = values.get(murmur3(`${p}.Content.Name`))
  const lifePtr = values.get(murmur3(`${p}.Content.Life`))
  const effectTypePtr = values.get(murmur3(`${p}.Content.Effect.Type`))
  const effectValuePtr = values.get(murmur3(`${p}.Content.Effect.Value`))
  if (namePtr === undefined || lifePtr === undefined || effectTypePtr === undefined || effectValuePtr === undefined) {
    return null
  }
  const dv = new DataView(buffer)
  return { namePtr, lifePtr, effectTypePtr, effectValuePtr, capacity: dv.getUint32(namePtr, true) }
}

/** lê o pouch da categoria a partir do save da sessão */
export function readEquipment(cat: EquipCategory): EquipPouch | null {
  const session = getSessionSave()
  if (!session) return null
  const save = parseSave(session.buffer)
  const arrays = equipArrays(save.values, cat, save.buffer)
  if (!arrays) return null

  const dv = new DataView(save.buffer)
  const bytes = new Uint8Array(save.buffer)
  const decoder = new TextDecoder()
  const slots: EquipSlot[] = []
  const freeIndices: number[] = []

  for (let i = 0; i < arrays.capacity; i++) {
    const start = arrays.namePtr + 4 + i * 64
    const slice = bytes.subarray(start, start + 64)
    const nul = slice.indexOf(0)
    const id = decoder.decode(nul === -1 ? slice : slice.subarray(0, nul)).trim()
    if (!id) {
      freeIndices.push(i)
      continue
    }
    slots.push({
      index: i,
      id,
      durability: dv.getInt32(arrays.lifePtr + 4 + i * 4, true),
      modifier: reverseModifier(cat, dv.getUint32(arrays.effectTypePtr + 4 + i * 4, true)),
      modifierValue: dv.getInt32(arrays.effectValuePtr + 4 + i * 4, true),
    })
  }

  return { category: cat, arrays, slots, capacity: arrays.capacity, freeIndices }
}
