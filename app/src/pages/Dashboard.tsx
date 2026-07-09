import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { computeProgress, overallFraction, useDataset } from '../lib/useDataset'
import { ZonaiRing } from '../components/ZonaiRing'
import { HudBar } from '../components/HudBar'

export function Dashboard() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const player = useAppStore((s) => s.player)

  const groups = useMemo(() => computeProgress(data, manual, fromSave), [data, manual, fromSave])
  const overall = overallFraction(groups)
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

      <section className="flex flex-col items-center pt-2">
        <ZonaiRing fraction={overall} size={210} sublabel={t('dashboard.overall')} />
        {overall === 0 && <p className="mt-3 max-w-xs text-center text-sm text-ink-mute">{t('dashboard.noData')}</p>}
      </section>

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
