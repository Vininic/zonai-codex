import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { computeProgress, useDataset } from '../lib/useDataset'

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

  return (
    <div className="space-y-1.5">
      <h2 className="mb-3 font-display text-lg">{t('tracker.title')}</h2>
      {groups.map((g) => {
        const frac = g.total ? g.done / g.total : 0
        const complete = frac >= 1
        return (
          <Link key={g.id} to={`/tracker/${g.id}`} className="panel flex items-center gap-3 px-3.5 py-3 transition-colors hover:border-edge-lit">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">{groupName(g.id, g.label)}</span>
                <span className="shrink-0 font-mono text-xs" style={{ color: complete ? 'var(--color-gold)' : 'var(--color-jade)' }}>
                  {g.done}
                  <span className="text-ink-faint">/{g.total}</span>
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-stone-2">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${frac * 100}%`,
                    background: complete ? 'var(--color-gold)' : 'var(--color-jade)',
                    boxShadow: complete ? 'var(--glow-gold)' : frac > 0 ? 'var(--glow-jade)' : undefined,
                  }}
                />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
