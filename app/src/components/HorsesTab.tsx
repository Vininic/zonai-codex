import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { loadHorseCatalog, readHorses, type HorseCatalogItem, type HorsePouch } from '../lib/horse'
import { ItemIcon } from './ItemIcon'

/**
 * Aba de cavalos — lista o estábulo (leitura, o formato tem 30 campos por
 * cavalo e a maioria não vale a pena editar) + a única ação de escrita que
 * importa aqui: soltar a Epona, cavalo exclusivo de amiibo sem outra forma
 * de obter no jogo (ver lib/horse.ts).
 */
export function HorsesTab({ hasSession }: { hasSession: boolean }) {
  const { t } = useTranslation()
  const grantEpona = useAppStore((s) => s.grantEpona)
  const setGrantEpona = useAppStore((s) => s.setGrantEpona)
  const [catalog, setCatalog] = useState<HorseCatalogItem[] | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadHorseCatalog().then((c) => !cancelled && setCatalog(c))
    return () => {
      cancelled = true
    }
  }, [])

  const pouch: HorsePouch | null = useMemo(() => (hasSession ? readHorses() : null), [hasSession])
  const labelFor = (id: string) => catalog?.find((c) => c.id === id)?.label ?? id

  if (!hasSession) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.noSessionEquip')}</p>
  }
  if (!pouch) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.equipUnavailable')}</p>
  }

  const canGrantEpona = !pouch.hasEpona && !grantEpona && pouch.freeIndices.length > 0
  const selected = selectedIdx !== null ? pouch.slots[selectedIdx] : null

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <p className="text-xs text-ink-faint">
          {t('inventory.equipCapacity', { used: pouch.slots.length, total: pouch.capacity, free: pouch.freeIndices.length })}
        </p>

        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-8">
          {pouch.slots.map((s, i) => (
            <button
              key={`${s.index}-${s.id}`}
              onClick={() => setSelectedIdx(i)}
              title={s.name ? `${s.name} (${labelFor(s.id)})` : labelFor(s.id)}
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5 transition-transform hover:scale-[1.04]"
              style={selectedIdx === i ? { borderColor: 'var(--color-gold)', boxShadow: 'var(--glow-gold)' } : undefined}
            >
              <ItemIcon iconId={s.id} fallback="horse" size={24} />
              {s.name && <span className="absolute bottom-1 right-1 max-w-full truncate font-mono text-[8px] text-ink-mute">{s.name}</span>}
            </button>
          ))}

          {canGrantEpona && (
            <button
              onClick={() => setGrantEpona(true)}
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5 transition-transform hover:scale-[1.04]"
              style={{ borderColor: 'var(--color-jade)' }}
              title={t('inventory.unlockEpona')}
            >
              <ItemIcon iconId="GameRomHorseEpona" fallback="horse" size={26} />
              <span className="text-[9px] text-jade">+</span>
            </button>
          )}

          {grantEpona && (
            <div
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5"
              style={{ borderColor: 'var(--color-jade)', boxShadow: 'var(--glow-jade)' }}
            >
              <ItemIcon iconId="GameRomHorseEpona" fallback="horse" size={26} />
              <span className="font-mono text-[8px]" style={{ color: 'var(--color-jade)' }}>
                Epona
              </span>
              <button
                onClick={() => setGrantEpona(false)}
                className="absolute left-1 top-0.5 text-[10px] text-ink-faint hover:text-gloom"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {pouch.hasEpona && <p className="text-xs" style={{ color: 'var(--color-jade)' }}>{t('inventory.eponaOwned')}</p>}
      </div>

      <aside className="panel h-fit p-4 lg:sticky lg:top-4">
        {selected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center py-2">
              <ItemIcon iconId={selected.id} fallback="horse" size={48} />
            </div>
            <h3 className="font-display text-base leading-tight">{selected.name || labelFor(selected.id)}</h3>
            <p className="font-mono text-[10px] text-ink-faint">{labelFor(selected.id)}</p>
            <dl className="space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-faint">{t('inventory.horseBond')}</dt>
                <dd className="font-mono">{Math.round(selected.bond * 100)}%</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">{t('inventory.horseHint')}</p>
        )}
      </aside>
    </div>
  )
}
