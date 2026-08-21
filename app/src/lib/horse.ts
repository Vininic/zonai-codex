import { murmur3 } from './murmur3'
import { parseSave } from './saveParser'
import { getSessionSave } from './saveSession'

/**
 * Pouch de cavalos (`OwnedHorseList.*`) — 30 arrays paralelos (ver
 * zelda-totk.class.pouch.js `Pouch.Structs.HORSES` no editor de referência),
 * bem mais rico que arco/arma/escudo: nome em UTF-16, cor por canal RGB,
 * stats, laço (bond) como float, e um BoolArray de verdade (1 bit por
 * cavalo, não 4 bytes) pro "familiaridade conferida".
 *
 * Expomos leitura do estábulo, edição dos campos que valem a pena mexer
 * (nome, laço, stats, crina/sela/rédea) e a liberação da Epona — exclusiva de
 * amiibo — com os valores padrão do próprio jogo
 * (Horse.DEFAULT_VALUES.GameRomHorseEpona no editor de referência). Os ~20
 * campos de cor por canal RGB ficam de fora de propósito: editá-los à mão
 * sem um color picker é mais chance de estragar o cavalo do que de melhorá-lo.
 * A gravação em si vive em saveWriter.ts, junto com o resto do plano.
 */

const INT_FIELDS = [
  'Toughness',
  'Speed',
  'ChargeNum',
  'HorsePower',
  'HorseType',
  'ColorType',
  'FootType',
  'RoomID',
  'Body.PrimaryColor.Red',
  'Body.PrimaryColor.Green',
  'Body.PrimaryColor.Blue',
  'Body.SecondaryColor.Red',
  'Body.SecondaryColor.Green',
  'Body.SecondaryColor.Blue',
  'Body.NoseColor.Red',
  'Body.NoseColor.Green',
  'Body.NoseColor.Blue',
  'Hair.PrimaryColor.Red',
  'Hair.PrimaryColor.Green',
  'Hair.PrimaryColor.Blue',
  'Hair.SecondaryColor.Red',
  'Hair.SecondaryColor.Green',
  'Hair.SecondaryColor.Blue',
] as const
const ENUM_FIELDS = ['Mane', 'Saddle', 'Rein', 'Body.Pattern', 'Body.EyeColor'] as const

const H = (field: string) => murmur3(`OwnedHorseList.${field}`)

export interface HorseSlot {
  index: number
  id: string
  name: string
  horseType: number
  bond: number
  statsStrength: number
  statsSpeed: number
  statsStamina: number
  statsPull: number
  mane: string
  saddle: string
  rein: string
}

/** listas de aparência (mesmos valores do Pouch.Structs.HORSES de referência) */
export const MANES = ['None','Horse_Link_Mane','Horse_Link_Mane_01','Horse_Link_Mane_02','Horse_Link_Mane_03','Horse_Link_Mane_04','Horse_Link_Mane_05','Horse_Link_Mane_06','Horse_Link_Mane_07','Horse_Link_Mane_08','Horse_Link_Mane_09','Horse_Link_Mane_10','Horse_Link_Mane_11','Horse_Link_Mane_12','Horse_Link_Mane_00L','Horse_Link_Mane_01L','Horse_Link_Mane_00S']
export const SADDLES = ['None','GameRomHorseSaddle_00','GameRomHorseSaddle_01','GameRomHorseSaddle_02','GameRomHorseSaddle_03','GameRomHorseSaddle_04','GameRomHorseSaddle_05','GameRomHorseSaddle_06','GameRomHorseSaddle_07','GameRomHorseSaddle_00L','GameRomHorseSaddle_00S']
export const REINS = ['None','GameRomHorseReins_00','GameRomHorseReins_01','GameRomHorseReins_02','GameRomHorseReins_03','GameRomHorseReins_04','GameRomHorseReins_05','GameRomHorseReins_06','GameRomHorseReins_00L','GameRomHorseReins_00S']

/** enum é gravado como hash do nome; desfaz isso pra exibir */
const reverseEnum = (list: string[], raw: number): string => {
  for (const name of list) if (murmur3(name) === (raw >>> 0)) return name
  return raw === 0 ? 'None' : `0x${(raw >>> 0).toString(16)}`
}

export interface HorsePouch {
  slots: HorseSlot[]
  capacity: number
  freeIndices: number[]
  hasEpona: boolean
}

const readWString16 = (dv: DataView, offset: number) => {
  let out = ''
  for (let i = 0; i < 0x20; i += 2) {
    const c = dv.getUint16(offset + i, true)
    if (!c) break
    out += String.fromCharCode(c)
  }
  return out
}

/** lê o pouch de cavalos a partir do save da sessão */
export function readHorses(): HorsePouch | null {
  const session = getSessionSave()
  if (!session) return null
  const save = parseSave(session.buffer)
  const namePtr = save.values.get(H('ActorName'))
  const wnamePtr = save.values.get(H('Name'))
  const typePtr = save.values.get(H('HorseType'))
  const bondPtr = save.values.get(H('Familiarity'))
  if (namePtr === undefined || wnamePtr === undefined || typePtr === undefined || bondPtr === undefined) return null
  const u32 = (field: string, i: number, dvv: DataView) => {
    const ptr = save.values.get(H(field))
    return ptr === undefined ? 0 : dvv.getUint32(ptr + 4 + i * 4, true)
  }

  const dv = new DataView(save.buffer)
  const bytes = new Uint8Array(save.buffer)
  const decoder = new TextDecoder()
  const capacity = dv.getUint32(namePtr, true)
  const slots: HorseSlot[] = []
  const freeIndices: number[] = []
  let hasEpona = false

  for (let i = 0; i < capacity; i++) {
    const start = namePtr + 4 + i * 64
    const slice = bytes.subarray(start, start + 64)
    const nul = slice.indexOf(0)
    const id = decoder.decode(nul === -1 ? slice : slice.subarray(0, nul)).trim()
    if (!id) {
      freeIndices.push(i)
      continue
    }
    if (id === 'GameRomHorseEpona') hasEpona = true
    slots.push({
      index: i,
      id,
      name: readWString16(dv, wnamePtr + 4 + i * 0x20),
      horseType: dv.getInt32(typePtr + 4 + i * 4, true),
      bond: dv.getFloat32(bondPtr + 4 + i * 4, true),
      statsStrength: u32('Toughness', i, dv),
      statsSpeed: u32('Speed', i, dv),
      statsStamina: u32('ChargeNum', i, dv),
      statsPull: u32('HorsePower', i, dv),
      mane: reverseEnum(MANES, u32('Mane', i, dv)),
      saddle: reverseEnum(SADDLES, u32('Saddle', i, dv)),
      rein: reverseEnum(REINS, u32('Rein', i, dv)),
    })
  }

  return { slots, capacity, freeIndices, hasEpona }
}

export interface HorseGrant {
  slotIndex: number
  writes: { hash: number; value: number }[]
  name: string
  ints: { field: string; value: number }[]
}

/**
 * Monta a gravação da Epona (Horse.DEFAULT_VALUES.GameRomHorseEpona no
 * editor de referência) pro primeiro slot livre. `bondChecked` fica ligado e
 * o laço no máximo — é assim que o amiibo entrega o cavalo, já mansinho.
 */
export function buildEponaGrant(slotIndex: number): {
  slotIndex: number
  name: string
  ints: Record<string, number>
  bond: number
  bondChecked: boolean
} {
  return {
    slotIndex,
    name: 'Epona',
    ints: {
      Mane: murmur3('Horse_Link_Mane'),
      Saddle: murmur3('GameRomHorseSaddle_06'),
      Rein: murmur3('GameRomHorseReins_06'),
      Toughness: 220,
      Speed: 3,
      ChargeNum: 4,
      HorsePower: 2,
      HorseType: 4,
      ColorType: 0,
      FootType: 0,
      RoomID: 0xffffffff,
      'Body.Pattern': murmur3('01'),
      'Body.EyeColor': murmur3('Black'),
      'Body.PrimaryColor.Red': 14,
      'Body.PrimaryColor.Green': 5,
      'Body.PrimaryColor.Blue': 3,
      'Body.SecondaryColor.Red': 168,
      'Body.SecondaryColor.Green': 149,
      'Body.SecondaryColor.Blue': 104,
      'Body.NoseColor.Red': 5,
      'Body.NoseColor.Green': 4,
      'Body.NoseColor.Blue': 3,
      'Hair.PrimaryColor.Red': 255,
      'Hair.PrimaryColor.Green': 255,
      'Hair.PrimaryColor.Blue': 255,
      'Hair.SecondaryColor.Red': 197,
      'Hair.SecondaryColor.Green': 179,
      'Hair.SecondaryColor.Blue': 136,
    },
    bond: 1,
    bondChecked: true,
  }
}

export { H as horseFieldHash, INT_FIELDS, ENUM_FIELDS }
export interface HorseCatalogItem {
  id: string
  label: string
  amiiboOnly: boolean
  untamable: boolean
}
let catalogCache: Promise<HorseCatalogItem[]> | null = null
export function loadHorseCatalog(): Promise<HorseCatalogItem[]> {
  catalogCache ??= fetch('/data/horses.json').then((r) => r.json().then((j) => j.horses))
  return catalogCache
}
