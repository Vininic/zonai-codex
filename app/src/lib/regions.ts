/**
 * Regiões de Hyrule por bounding box aproximada, no referencial do dataset
 * (x ∈ [−6000,6000] oeste→leste, z ∈ [−5000,5000] com +z = norte).
 * Âncoras calibradas pelas torres (Pikida NW z>0, Gerudo Canyon SW z<0…).
 */
export interface Region {
  id: string
  /** nome exibido (nomes próprios ficam em EN por decisão) */
  name: string
  aliases: string[]
  box: { x1: number; x2: number; z1: number; z2: number }
}

export const REGIONS: Region[] = [
  { id: 'hebra', name: 'Hebra', aliases: ['hebra', 'tabantha snowfield'], box: { x1: -5000, x2: -1200, z1: 1400, z2: 5000 } },
  { id: 'tabantha', name: 'Tabantha / Hyrule Ridge', aliases: ['tabantha', 'rito', 'hyrule ridge', 'ridge'], box: { x1: -4300, x2: -1400, z1: 0, z2: 1600 } },
  { id: 'gerudo', name: 'Gerudo', aliases: ['gerudo', 'desert', 'deserto', 'highlands'], box: { x1: -6000, x2: -1500, z1: -5000, z2: -1100 } },
  { id: 'great_plateau', name: 'Great Plateau', aliases: ['great plateau', 'plato', 'platô'], box: { x1: -2100, x2: -600, z1: -2700, z2: -1400 } },
  { id: 'central', name: 'Central Hyrule', aliases: ['central', 'hyrule field', 'castle', 'castelo', 'lookout landing'], box: { x1: -1500, x2: 900, z1: -1500, z2: 1100 } },
  { id: 'faron', name: 'Faron', aliases: ['faron', 'lurelin'], box: { x1: 200, x2: 3000, z1: -5000, z2: -2400 } },
  { id: 'necluda', name: 'Necluda', aliases: ['necluda', 'hateno', 'kakariko', 'dueling peaks'], box: { x1: 800, x2: 4600, z1: -3000, z2: -700 } },
  { id: 'lanayru', name: 'Lanayru', aliases: ['lanayru', 'zora'], box: { x1: 2300, x2: 6000, z1: -1500, z2: 1400 } },
  { id: 'eldin', name: 'Eldin', aliases: ['eldin', 'death mountain', 'goron'], box: { x1: 800, x2: 3200, z1: 600, z2: 2900 } },
  { id: 'akkala', name: 'Akkala', aliases: ['akkala'], box: { x1: 2700, x2: 6000, z1: 1400, z2: 4200 } },
  { id: 'great_forest', name: 'Great Hyrule Forest', aliases: ['korok forest', 'lost woods', 'great hyrule forest', 'floresta'], box: { x1: -400, x2: 1200, z1: 1700, z2: 3400 } },
]

export function regionById(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id)
}

export function inRegion(region: Region, x: number, z: number): boolean {
  return x >= region.box.x1 && x <= region.box.x2 && z >= region.box.z1 && z <= region.box.z2
}

export function regionCenter(region: Region): { x: number; z: number } {
  return { x: (region.box.x1 + region.box.x2) / 2, z: (region.box.z1 + region.box.z2) / 2 }
}
