import type { CompletionData, Stat } from './dataset'
import { readString64Array } from './saveParser'
import { getSessionSave } from './saveSession'
import { parseSave } from './saveParser'
import type { Progress } from '../store/appStore'

/**
 * Plano determinístico de upgrade de armadura: níveis restantes até 4★,
 * materiais por nível e totais, cruzados com o estoque real do save
 * (arrays do pouch) quando há save na sessão.
 */

interface UpgradeCost {
  material: string
  quantity: number
}
interface UpgradeArmorEntry {
  label: string
  levels: Record<string, UpgradeCost[]>
}
interface UpgradeMaterialsBlock {
  materialStockArrayHash: string
  armor: UpgradeArmorEntry[]
  items: { material: string; actorName: string; type?: string; totalRequired?: number }[]
}

export interface ArmorPlanCost {
  material: string
  qty: number
  /** null = estoque desconhecido (sem save na sessão) */
  owned: number | null
}

export interface ArmorPlan {
  label: string
  owned: boolean
  /** null = desconhecido sem o buffer do save */
  currentStars: number | null
  upgradable: boolean
  levels: { level: number; costs: ArmorPlanCost[] }[]
  totals: ArmorPlanCost[]
  chest: { itemId: string; x: number; z: number; layer: string } | null
}

function upgradeBlock(data: CompletionData): UpgradeMaterialsBlock | null {
  const stat = data.stats.find((s) => s.id === 'armor_upgraded') as (Stat & { upgradeMaterials?: UpgradeMaterialsBlock }) | undefined
  return stat?.upgradeMaterials ?? null
}

export function allArmorLabels(data: CompletionData): string[] {
  const inv = data.stats.find((s) => s.id === 'armor_inventory')
  return (inv?.items ?? []).map((i) => i.label ?? i.id)
}

/** estoque de materiais do save da sessão: label do material -> quantidade */
function materialStock(data: CompletionData, block: UpgradeMaterialsBlock): Map<string, number> | null {
  const session = getSessionSave()
  if (!session) return null
  const save = parseSave(session.buffer)
  const materialsStat = data.stats.find((s) => s.id === 'materials')
  const namesPtr = materialsStat?.arrayHash ? save.values.get(parseInt(materialsStat.arrayHash, 16)) : undefined
  const stockPtr = save.values.get(parseInt(block.materialStockArrayHash, 16))
  if (namesPtr === undefined || stockPtr === undefined) return null

  const names = readString64Array(save.buffer, namesPtr)
  const dv = new DataView(save.buffer)
  const count = dv.getUint32(stockPtr, true)
  const byActor = new Map<string, number>()
  for (let i = 0; i < Math.min(count, names.length); i++) {
    byActor.set(names[i], dv.getUint32(stockPtr + 4 + i * 4, true))
  }
  const byLabel = new Map<string, number>()
  for (const item of block.items) {
    byLabel.set(item.material, byActor.get(item.actorName) ?? 0)
  }
  return byLabel
}

/** estrelas atuais da peça, lendo os ids do pouch do save da sessão */
function currentStarsFromSession(data: CompletionData, armorLabel: string): { owned: boolean; stars: number } | null {
  const session = getSessionSave()
  if (!session) return null
  const save = parseSave(session.buffer)
  const inv = data.stats.find((s) => s.id === 'armor_inventory')
  if (!inv?.arrayHash) return null
  const ptr = save.values.get(parseInt(inv.arrayHash, 16))
  const pouch = new Set(readString64Array(save.buffer, ptr))
  const item = inv.items.find((i) => (i.label ?? i.id) === armorLabel) as
    | { ids?: string[]; levels?: { id: string; stars: number }[] }
    | undefined
  if (!item) return null
  const owned = (item.ids ?? []).some((id) => pouch.has(id))
  let stars = 0
  for (const lvl of item.levels ?? []) if (pouch.has(lvl.id)) stars = Math.max(stars, lvl.stars)
  return { owned, stars }
}

export function buildArmorPlan(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  armorLabel: string,
): ArmorPlan | null {
  const inv = data.stats.find((s) => s.id === 'armor_inventory')
  const invItem = inv?.items.find((i) => (i.label ?? i.id) === armorLabel)
  if (!invItem) return null

  const block = upgradeBlock(data)
  const entry = block?.armor.find((a) => a.label === armorLabel) ?? null
  const stock = block ? materialStock(data, block) : null

  const session = currentStarsFromSession(data, armorLabel)
  const upgradedStat = data.stats.find((s) => s.id === 'armor_upgraded')
  const upgradedItem = upgradedStat?.items.find((i) => (i.label ?? i.id) === armorLabel)
  const doneUpgraded = upgradedItem ? !!(manual['armor_upgraded']?.[upgradedItem.id] || fromSave['armor_upgraded']?.[upgradedItem.id]) : false
  const doneOwned = !!(manual['armor_inventory']?.[invItem.id] || fromSave['armor_inventory']?.[invItem.id])

  const owned = session?.owned ?? doneOwned
  const currentStars = session ? session.stars : doneUpgraded ? 4 : owned ? null : 0

  const levels: ArmorPlan['levels'] = []
  const totalsMap = new Map<string, number>()
  if (entry) {
    const from = currentStars ?? 0
    for (const [levelText, costs] of Object.entries(entry.levels)) {
      const level = parseInt(levelText, 10)
      if (level <= from) continue
      const levelCosts: ArmorPlanCost[] = costs.map((c) => ({
        material: c.material,
        qty: c.quantity,
        owned: stock ? (stock.get(c.material) ?? 0) : null,
      }))
      levels.push({ level, costs: levelCosts })
      for (const c of costs) totalsMap.set(c.material, (totalsMap.get(c.material) ?? 0) + c.quantity)
    }
    levels.sort((a, b) => a.level - b.level)
  }
  const totals: ArmorPlanCost[] = [...totalsMap.entries()]
    .map(([material, qty]) => ({ material, qty, owned: stock ? (stock.get(material) ?? 0) : null }))
    .sort((a, b) => a.material.localeCompare(b.material))

  // baú da peça (qualquer variante de id) — pra rota no mapa quando não possuída
  let chest: ArmorPlan['chest'] = null
  const ids = new Set((invItem as { ids?: string[] }).ids ?? [])
  const chestCat = data.categories.find((c) => c.id === 'armor')
  const chestItem = chestCat?.items.find((i) => (i as { armorId?: string }).armorId && ids.has((i as { armorId?: string }).armorId!))
  if (chestItem) chest = { itemId: chestItem.id, x: chestItem.x, z: chestItem.z, layer: chestItem.layer ?? 'surface' }

  return { label: armorLabel, owned, currentStars, upgradable: !!entry, levels, totals, chest }
}
