import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { computeProgress, mapFraction, overallFraction, useDataset, type GroupProgress } from '../lib/useDataset'
import { categoryMeta } from '../lib/categoryMeta'
import { ZonaiRing } from '../components/ZonaiRing'
import { HudBar } from '../components/HudBar'
import { RadialLayers } from '../components/charts/RadialLayers'
import { DonutChart } from '../components/charts/DonutChart'

const QUEST_GROUPS = ['quests_main', 'quests_side', 'quests_adventure', 'quests_shrine', 'memories']

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

  // radial: os grupos mais incompletos (o que falta atacar)
  const focusRings = useMemo(
    () =>
      [...groups]
        .filter((g) => g.done < g.total)
        .sort((a, b) => a.done / a.total - b.done / b.total)
        .slice(0, 7)
        .map((g) => ({ id: g.id, name: groupName(g.id, g.label), done: g.done, total: g.total })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, t],
  )

  const questDonut = QUEST_GROUPS.map((id) => {
    const g = groups.find((x) => x.id === id)
    return g
      ? { id, name: groupName(id, g.label), value: g.done, total: g.total, color: categoryMeta(id).color }
      : null
  }).filter(Boolean) as { id: string; name: string; value: number; total: number; color: string }[]
  const questsDone = questDonut.reduce((a, d) => a + d.value, 0)
  const questsTotal = questDonut.reduce((a, d) => a + (d.total ?? 0), 0)

  return (
    <div className="space-y-5">
      {player && <HudBar player={player} />}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* hero */}
        <section className="panel flex flex-col items-center gap-6 p-6 sm:flex-row sm:justify-center lg:col-span-2 lg:justify-around">
          <ZonaiRing fraction={overall} size={215} sublabel={t('dashboard.overall')} hero />
          <div className="flex flex-col items-center gap-4">
            <ZonaiRing fraction={mapPct} size={110} sublabel={t('dashboard.mapPct')} />
            {overall === 0 && <p className="max-w-45 text-center text-xs text-ink-mute">{t('dashboard.noData')}</p>}
          </div>
          {focusRings.length > 0 && (
            <div className="hidden xl:block">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-ink-faint">{t('dashboard.focus')}</p>
              <RadialLayers data={focusRings} size={200} />
            </div>
          )}
        </section>

        {/* quests donut */}
        <section className="panel p-5">
          <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-ink-mute">{t('dashboard.quests')}</h2>
          <DonutChart
            data={questDonut}
            centerLabel={t('dashboard.questsDone')}
            centerValue={`${Math.round((questsDone / Math.max(questsTotal, 1)) * 100)}%`}
            size={140}
          />
        </section>

        {/* radial em telas menores que xl */}
        {focusRings.length > 0 && (
          <section className="panel p-5 xl:hidden lg:col-span-2">
            <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-ink-mute">{t('dashboard.focus')}</h2>
            <RadialLayers data={focusRings} size={190} />
          </section>
        )}

        <details className="panel px-4 py-3 lg:col-span-1">
          <summary className="cursor-pointer list-none font-display text-xs uppercase tracking-widest text-ink-mute">
            ⚙ {t('dashboard.customize')}
          </summary>
          <p className="mt-2 text-xs text-ink-faint">{t('dashboard.customizeHint')}</p>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
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
      </div>

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
  groups: GroupProgress[]
  groupName: (id: string, fallback: string) => string
}) {
  return (
    <section>
      <h2 className="mb-2 font-display text-sm uppercase tracking-widest text-ink-mute">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {groups.map((g) => {
          const frac = g.total ? g.done / g.total : 0
          const complete = frac >= 1
          const meta = categoryMeta(g.id)
          return (
            <Link
              key={g.id}
              to={`/tracker/${g.id}`}
              className="panel group flex flex-col gap-2 px-3 py-2.5 transition-colors hover:border-edge-lit"
            >
              <div className="flex items-center gap-2">
                {meta.icon ? (
                  <img src={meta.icon} alt="" className="h-5 w-5 object-contain opacity-90" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{groupName(g.id, g.label)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-stone-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${frac * 100}%`,
                    background: complete ? 'var(--color-gold)' : meta.color,
                    boxShadow: `0 0 6px ${complete ? 'var(--color-gold)' : meta.color}`,
                  }}
                />
              </div>
              <div className="font-mono text-[11px]" style={{ color: complete ? 'var(--color-gold)' : meta.color }}>
                {g.done}
                <span className="text-ink-faint">/{g.total}</span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
