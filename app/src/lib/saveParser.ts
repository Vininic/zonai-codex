import { murmur3 } from './murmur3'

/**
 * Parser do progress.sav de Tears of the Kingdom.
 * Formato: magic u32 0x01020304; tabela de pares (u32 hash murmur3, u32 valor)
 * a partir de 0x28 até o hash MetaData.SaveTypeHash; escalares inline, tipos
 * compostos guardam ponteiro; array de GUIDs u64 no final (terminado em 0,0).
 * Referência: reference/NOTES.md + savegame-editors (MIT, Marc Robledo).
 */

export const MAGIC = 0x01020304
export const META_SAVE_TYPE = 0xa3db7114
export const CLEAR_HASH = 0x62965740

const VERSIONS: Record<number, string> = {
  2307552: 'v1.0',
  2307656: 'v1.1.x/1.2.x',
  2307856: 'v1.4.x',
}

const H_RUPEES = murmur3('PlayerStatus.CurrentRupee')
const H_MAX_LIFE = murmur3('PlayerStatus.MaxLife')
const H_MAX_STAMINA = murmur3('PlayerStatus.MaxStamina')
const H_MAX_ENERGY = murmur3('PlayerStatus.MaxEnergy')

export interface PlayerStats {
  rupees: number
  hearts: number
  maxHearts: number
  staminaWheels: number
  maxStaminaWheels: number
  batteryCells: number
  maxBatteryCells: number
}

export interface ParsedSave {
  version: string
  fileSize: number
  /** hash -> valor bruto u32 (escalares inline; compostos = ponteiro) */
  values: Map<number, number>
  guids: Set<bigint>
  player: PlayerStats
}

export class SaveParseError extends Error {}

function reinterpretF32(u32Value: number): number {
  const dv = new DataView(new ArrayBuffer(4))
  dv.setUint32(0, u32Value, true)
  return dv.getFloat32(0, true)
}

export function parseSave(buffer: ArrayBuffer): ParsedSave {
  const dv = new DataView(buffer)
  const u32 = (off: number) => dv.getUint32(off, true)

  if (buffer.byteLength < 0x30 || u32(0) !== MAGIC) {
    throw new SaveParseError('not-a-save')
  }

  const values = new Map<number, number>()
  let guidPtr = -1
  for (let off = 0x28; off < buffer.byteLength - 8; off += 8) {
    const hash = u32(off)
    if (hash === META_SAVE_TYPE) {
      guidPtr = u32(off + 4)
      break
    }
    values.set(hash, u32(off + 4))
  }
  if (guidPtr < 0) throw new SaveParseError('hash-table-end-not-found')

  const guids = new Set<bigint>()
  for (let off = guidPtr; off < buffer.byteLength - 7; off += 8) {
    const lower = u32(off)
    const upper = u32(off + 4)
    if (lower === 0 && upper === 0) break
    guids.add((BigInt(upper) << 32n) | BigInt(lower))
  }

  const player: PlayerStats = {
    rupees: values.get(H_RUPEES) ?? 0,
    hearts: (values.get(H_MAX_LIFE) ?? 0) / 4,
    maxHearts: 40,
    staminaWheels: reinterpretF32(values.get(H_MAX_STAMINA) ?? 0) / 1000,
    maxStaminaWheels: 3,
    batteryCells: reinterpretF32(values.get(H_MAX_ENERGY) ?? 0) / 1000,
    maxBatteryCells: 48,
  }

  return {
    version: VERSIONS[buffer.byteLength] ?? 'unknown',
    fileSize: buffer.byteLength,
    values,
    guids,
    player,
  }
}
