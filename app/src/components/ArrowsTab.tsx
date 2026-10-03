import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { readArrowCount } from '../lib/equipment'
import { ItemIcon } from './ItemIcon'

/**
 * Aba de flechas. `Pouch.Arrow` guarda nome + quantidade e o jogo só tem um
 * tipo de flecha (NormalArrow) — as elementais são o resultado de fundir um
 * material na flecha, não itens de inventário. Por isso aqui é um campo de
 * quantidade, e não uma grade como as outras abas.
 */
export function ArrowsTab({ hasSession }: { hasSession: boolean }) {
  const { t } = useTranslation()
  const arrowQty = useAppStore((s) => s.arrowQty)
  const setArrowQty = useAppStore((s) => s.setArrowQty)

  const current = useMemo(() => (hasSession ? readArrowCount() : null), [hasSession])

  if (!hasSession) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.noSessionEquip')}</p>
  }
  if (current === null) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.equipUnavailable')}</p>
  }

  const staged = arrowQty !== null && arrowQty !== current
  const shown = arrowQty ?? current

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_24rem]">
      <div className="panel flex items-center gap-4 p-4">
        <ItemIcon iconId="NormalArrow" fallback="misc" size={56} />
        <div className="min-w-0">
          <h3 className="font-display text-base leading-tight">{t('inventory.arrows')}</h3>
          <p className="mt-0.5 text-xs text-ink-faint">{t('inventory.arrowsHint')}</p>
        </div>
      </div>

      <aside className="panel h-fit space-y-3 p-4">
        <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
          {t('inventory.arrowCount')}
          <input
            type="number"
            min={0}
            max={999}
            value={shown}
            onChange={(e) => setArrowQty(Math.max(0, Math.min(999, Number(e.target.value) || 0)))}
            className="panel mt-1 w-full bg-stone-2 px-2 py-1.5 font-mono text-sm text-ink focus:outline-none"
            style={staged ? { borderColor: 'var(--color-jade)' } : undefined}
          />
        </label>
        <p className="font-mono text-[10px] text-ink-faint">{t('save.detected')}: {current}</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setArrowQty(999)} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
            {t('inventory.arrowMax')}
          </button>
          {staged && (
            <button onClick={() => setArrowQty(null)} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
              {t('inventory.resetSlot')}
            </button>
          )}
        </div>
        {staged && (
          <Link to="/save" className="block text-xs underline decoration-edge-lit underline-offset-2 hover:text-jade">
            {t('inventory.goToSave')}
          </Link>
        )}
      </aside>
    </div>
  )
}
