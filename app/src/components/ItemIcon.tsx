import { useState } from 'react'
import { itemIconUrl, useItemIconsReady } from '../lib/itemIcon'
import { TypeIcon, type IconKind } from './TypeIcon'

/**
 * Sprite genérico por categoria, pra quando o item não tem asset próprio.
 * O caso real: os 5 tecidos dos Sábios (Obj_SubstituteCloth_57..61) são mais
 * novos que o pacote de ícones do editor de referência, que para no 56 — não
 * há sprite deles em lugar nenhum. Cair no tecido genérico fica coerente com
 * os outros 24 tecidos; o desenho vetorial destoava da grade inteira.
 */
const GENERIC_BY_KIND: Partial<Record<IconKind, string>> = {
  fabric: 'Obj_SubstituteCloth_Default',
}

/**
 * Ícone real do item (WebP, ver lib/itemIcon.ts) quando existe manifesto pro
 * id; senão tenta o genérico da categoria; e só então cai pro TypeIcon
 * vetorial.
 */
export function ItemIcon({ iconId, fallback, size = 22 }: { iconId?: string | null; fallback: IconKind; size?: number }) {
  const ready = useItemIconsReady()
  const [broken, setBroken] = useState(false)
  const url = ready ? (itemIconUrl(iconId) ?? itemIconUrl(GENERIC_BY_KIND[fallback])) : null
  if (!url || broken) return <TypeIcon kind={fallback} size={size} />
  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain', imageRendering: 'auto' }}
      onError={() => setBroken(true)}
    />
  )
}
