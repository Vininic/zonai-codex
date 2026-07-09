import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { computeProgress, mapFraction, overallFraction, useDataset } from '../lib/useDataset'
import { ZonaiRing } from '../components/ZonaiRing'
import { HudBar } from '../components/HudBar'

export function Dashboard() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const player = useAppStore((s) => s.player)
  const excluded = useAppStore((s) => s.excluded)
  const toggleExcluded = useAppStore((s) => s.toggleExcluded)

  const groups = useMemo(() => computeProgress(data, manual, fromSave), [data, manual, fromSave])
  const overall = overallFraction(groups, excluded)
  const mapPct = mapFraction(groups)
  const markers = groups.filter((g) => g.isMarkerCategory)
  const stats = groups.filter((g) => !g.isMarkerCategory)

  const groupName = (id: string, fallback: string) => {
    const key = `groups.${id}`
    const translated = t(key)
    return translated === key ? fallback : translated
  }

  return (
    <div className="space-y-6">
      {player && <HudBar player={player} />}

      <section className="flex items-center justify-center gap-6 pt-2">
        <ZonaiRing fraction={overall} size={190} sublabel={t('dashboard.overall')} />
        <ZonaiRing fraction={mapPct} size={110} sublabel={t('dashboard.mapPct')} />
      </section>
      {overall === 0 && <p className="mx-auto -mt-2 max-w-xs text-center text-sm text-ink-mute">{t('dashboard.noData')}</p>}

      <details className="panel px-4 py-3">
        <summary className="cursor-pointer list-none font-display text-xs uppercase tracking-widest text-ink-mute">
          ⚙ {t('dashboard.customize')}
        </summary>
        <p className="mt-2 text-xs text-ink-faint">{t('dashboard.customizeHint')}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {groups.map((g) => (
            <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs text-ink-mute">
              <input
                type="checkbox"
                checked={!excluded[g.id]}
                onChange={() => toggleExcluded(g.id)}
                className="h-3.5 w-3.5 accent-(--color-jade)"
              />
              <span className="truncate">{groupName(g.id, g.label)}</span>
            </label>
          ))}
        </div>
      </details>

      <GroupGrid title={t('dashboard.markers')} groups={markers} groupName={groupName} />
      <GroupGrid title={t('dashboard.stats')} groups={stats} groupName={groupName} />

      <p className="pb-2 text-center text-[10px] text-ink-faint">{t('common.credits')}</p>
    </div>
  )
}

function GroupGrid({
  title,
  groups,
  groupName,
}: {
  title: string
  groups: ReturnType<typeof computeProgress>
  groupName: (id: string, fallback: string) => string
}) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm uppercase tracking-widest text-ink-mute">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {groups.map((g) => {
          const frac = g.total ? g.done / g.total : 0
          const complete = frac >= 1
          return (
            <Link
              key={g.id}
              to={`/tracker/${g.id}`}
              className="panel flex items-center gap-3 px-3 py-2.5 transition-colors hover:border-edge-lit"
            >
              <ZonaiRing fraction={frac} size={44} value=" " />
              <div className="min-w-0">
                <div className="truncate text-xs text-ink">{groupName(g.id, g.label)}</div>
                <div className="font-mono text-xs" style={{ color: complete ? 'var(--color-gold)' : 'var(--color-jade)' }}>
                  {g.done}
                  <span className="text-ink-faint">/{g.total}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
