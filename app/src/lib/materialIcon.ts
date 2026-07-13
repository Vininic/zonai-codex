export type MaterialBucket =
  | 'fruit'
  | 'mushroom'
  | 'plant'
  | 'meat'
  | 'fish'
  | 'insect'
  | 'ore'
  | 'monster'
  | 'zonai'
  | 'misc'

/**
 * O dataset não traz ícone por item (só por categoria de mapa) — classifica
 * cada material num "tipo" visual pelo prefixo do actorName, pra tab de
 * Inventário ter variedade sem precisar de 251 assets (que também seriam
 * texturas do jogo, fora do escopo de redistribuir).
 */
export function classifyMaterial(actorName: string | undefined, label: string): MaterialBucket {
  const a = actorName ?? ''
  const l = label.toLowerCase()

  if (l.includes('zonaite') || l.includes('zonai charge')) return 'zonai'
  if (/^Item_Fruit_|Fruit$/.test(a)) return 'fruit'
  if (/^Item_Mushroom/.test(a)) return 'mushroom'
  if (/^Item_PlantGet_|^FldObj_Pinecone|^Obj_FireWoodBundle|^LightBall_/.test(a)) return 'plant'
  if (/^Item_Meat_/.test(a)) return 'meat'
  if (/^Item_FishGet_/.test(a)) return 'fish'
  if (/^Item_InsectGet_|^Animal_Insect_/.test(a)) return 'insect'
  if (/^Item_Ore_/.test(a)) return 'ore'
  if (/^Item_Enemy_|^Item_KingScale|^Item_Weapon_/.test(a)) return 'monster'
  return 'misc'
}
