import { useState } from 'react'
import { itemIconUrl, useItemIconsReady } from '../lib/itemIcon'
import { TypeIcon, type IconKind } from './TypeIcon'

/**
 * Ícone real do item (WebP, ver lib/itemIcon.ts) quando existe manifesto pro
 * id; cai pro TypeIcon vetorial (bucket/categoria) quando não há asset —
 * cobre casos como "Ordinary Fabric" genérico ou ids sem ícone dedicado.
 */
export function ItemIcon({ iconId, fallback, size = 22 }: { iconId?: string | null; fallback: IconKind; size?: number }) {
  const ready = useItemIconsReady()
  const [broken, setBroken] = useState(false)
  const url = ready ? itemIconUrl(iconId) : null
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
