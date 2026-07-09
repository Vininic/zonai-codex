import type { CategoryItem, StatItem } from './dataset'

/**
 * Melhor label disponível pra um item do dataset.
 * Shrines/lightroots ainda não têm nome humano na fonte (F1 pendente) —
 * cai pra coordenadas, que são úteis pra localizar jogando.
 */
export function itemLabel(item: CategoryItem | StatItem): string {
  if ('label' in item && item.label) return item.label
  if ('note' in item && item.note) {
    // notas começam com o GUID do objeto; o resto (quando existe) é descritivo
    const cleaned = item.note.replace(/^\d{12,}\s*-?\s*/, '').trim()
    if (cleaned) return cleaned
  }
  if ('x' in item && typeof item.x === 'number') {
    const layer = 'layer' in item && item.layer ? ` · ${item.layer}` : ''
    return `(${Math.round(item.x)}, ${Math.round(item.z)})${layer}`
  }
  return item.id
}
