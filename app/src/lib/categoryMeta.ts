/**
 * Identidade visual por categoria: cor categórica (compatível com o dark
 * Zonai) + ícone (zd-icons, MIT/zeldadungeon via TOTK-100-live-map).
 * Usada por dashboard, tracker, mapa (markers + legenda) e companion.
 */
export interface CategoryMeta {
  color: string
  icon: string | null
}

const M: Record<string, CategoryMeta> = {
  towers: { color: '#57a6e6', icon: '/icons/tower.png' },
  shrines: { color: '#57e6c0', icon: '/icons/shrine.png' },
  shrine_chests: { color: '#3fbf9a', icon: '/icons/chest_shrine.png' },
  lightroots: { color: '#8ae657', icon: '/icons/lightroot.png' },
  caves: { color: '#b98ae6', icon: '/icons/cave.png' },
  bubbulfrogs: { color: '#e657d0', icon: '/icons/monster.png' },
  hudson_sign: { color: '#e6a957', icon: '/icons/hudsonsign.svg' },
  dungeon_bosses: { color: '#e65757', icon: '/icons/skull.png' },
  flux_construct: { color: '#57cfe6', icon: '/icons/square.png' },
  hinox: { color: '#d95d6a', icon: '/icons/hinox.svg' },
  stone_talus: { color: '#c9a06a', icon: '/icons/ore.png' },
  molduga: { color: '#e6d057', icon: '/icons/molduga.svg' },
  frox: { color: '#a3e657', icon: '/icons/frox.svg' },
  gleeok: { color: '#ff7b5c', icon: '/icons/gleeok.svg' },
  wells: { color: '#6a8de6', icon: '/icons/well.png' },
  chasms: { color: '#c05ce6', icon: '/icons/chasm.png' },
  koroks: { color: '#ffd23f', icon: '/icons/korok.png' },
  schema_stone: { color: '#57e67d', icon: '/icons/objective.png' },
  yiga_schematic: { color: '#e65792', icon: '/icons/schematic.png' },
  old_map: { color: '#d9b96a', icon: '/icons/oldmap.png' },
  armor: { color: '#e6c957', icon: '/icons/treasure.png' },
  sage_will: { color: '#7de657', icon: '/icons/sageswill.png' },
  general_locations: { color: '#8fa79b', icon: null },
  // stats (sem mapa)
  compendium: { color: '#57cfe6', icon: null },
  armor_inventory: { color: '#e6c957', icon: '/icons/treasure.png' },
  armor_upgraded: { color: '#d9b96a', icon: '/icons/star.png' },
  pristine_weapons: { color: '#57e6c0', icon: null },
  fabrics: { color: '#b98ae6', icon: null },
  fabrics_amiibo: { color: '#e657d0', icon: null },
  recipes: { color: '#e6a957', icon: null },
  materials: { color: '#8ae657', icon: '/icons/leaf.png' },
  key_items: { color: '#ffd23f', icon: null },
  quests_main: { color: '#57e6c0', icon: '/icons/objective.png' },
  quests_side: { color: '#57a6e6', icon: null },
  quests_adventure: { color: '#b98ae6', icon: null },
  quests_shrine: { color: '#3fbf9a', icon: null },
  memories: { color: '#e65792', icon: null },
  character_profiles: { color: '#e6a957', icon: null },
  zonai_devices: { color: '#57e67d', icon: null },
}

const FALLBACK: CategoryMeta = { color: '#8fa79b', icon: null }

export function categoryMeta(id: string): CategoryMeta {
  return M[id] ?? FALLBACK
}

/** categorias com poucos itens usam ícone real no mapa; densas ficam em canvas */
export const ICON_MARKER_MAX_ITEMS = 250
