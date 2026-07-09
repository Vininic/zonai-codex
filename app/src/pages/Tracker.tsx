import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { computeProgress, useDataset, type GroupProgress } from '../lib/useDataset'
import { categoryMeta } from '../lib/categoryMeta'

export function Tracker() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const groups = useMemo(() => computeProgress(data, manual, fromSave), [data, manual, fromSave])

  const groupName = (id: string, fallback: string) => {
    const key = `groups.${id}`
    const translated = t(key)
    return translated === key ? fallback : translated
  }

  const markers = groups.filter((g) => g.isMarkerCategory)
  const stats = groups.filter((g) => !g.isMarkerCategory)

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg">{t('tracker.title')}</h2>
      <div className="grid gap-5 xl:grid-cols-2">
        <GroupTable title={t('dashboard.markers')} groups={markers} groupName={groupName} />
        <GroupTable title={t('dashboard.stats')} groups={stats} groupName={groupName} />
      </div>
    </div>
  )
}

function GroupTable({
  title,
  groups,
  groupName,
}: {
  title: string
  groups: GroupProgress[]
  groupName: (id: string, fallback: string) => string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <section className="panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-[10px] uppercase tracking-widest text-ink-faint">
            <th className="px-4 py-2.5 font-normal">{title}</th>
            <th className="hidden w-2/5 px-3 py-2.5 font-normal sm:table-cell">{t('tracker.progress')}</th>
            <th className="px-3 py-2.5 text-right font-normal">{t('tracker.count')}</th>
            <th className="w-14 px-4 py-2.5 text-right font-normal">%</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const frac = g.total ? g.done / g.total : 0
            const complete = frac >= 1
            const meta = categoryMeta(g.id)
            const color = complete ? 'var(--color-gold)' : meta.color
            return (
              <tr
                key={g.id}
                onClick={() => navigate(`/tracker/${g.id}`)}
                className="cursor-pointer border-b border-edge/40 transition-colors last:border-0 hover:bg-stone-2/60"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {meta.icon ? (
                      <img src={meta.icon} alt="" className="h-4.5 w-4.5 object-contain opacity-90" />
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
                    )}
                    <span className="truncate">{groupName(g.id, g.label)}</span>
                  </div>
                </td>
                <td className="hidden px-3 py-2.5 sm:table-cell">
                  <div className="h-1 overflow-hidden rounded-full bg-stone-2">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${frac * 100}%`, background: color, boxShadow: `0 0 5px ${color}` }}
                    />
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-xs" style={{ color }}>
                  {g.done}
                  <span className="text-ink-faint">/{g.total}</span>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-ink-mute">{Math.round(frac * 100)}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
