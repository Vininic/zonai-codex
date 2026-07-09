import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { useDataset } from '../lib/useDataset'

type Filter = 'all' | 'pending' | 'done'

export function Category() {
  const { groupId = '' } = useParams()
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const toggleManual = useAppStore((s) => s.toggleManual)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const group = useMemo(
    () =>
      data.categories.find((c) => c.id === groupId) ??
      data.stats.find((s) => s.id === groupId),
    [data, groupId],
  )

  const manualSet = manual[groupId] ?? {}
  const saveSet = fromSave[groupId] ?? {}

  const items = useMemo(() => {
    if (!group) return []
    const q = query.trim().toLowerCase()
    return group.items.filter((item) => {
      const done = !!(manualSet[item.id] || saveSet[item.id])
      if (filter === 'done' && !done) return false
      if (filter === 'pending' && done) return false
      if (q) {
        const label = ('label' in item && item.label) || ('note' in item && (item as { note?: string }).note) || item.id
        return label.toLowerCase().includes(q)
      }
      return true
    })
  }, [group, filter, query, manualSet, saveSet])

  if (!group) return <p className="text-ink-mute">Not found.</p>

  const key = `groups.${group.id}`
  const translated = t(key)
  const name = translated === key ? group.label : translated
  const doneCount = group.items.filter((i) => manualSet[i.id] || saveSet[i.id]).length

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg">
          <Link to="/tracker" className="text-ink-faint">
            ‹{' '}
          </Link>
          {name}
        </h2>
        <span className="font-mono text-sm" style={{ color: doneCount === group.items.length ? 'var(--color-gold)' : 'var(--color-jade)' }}>
          {doneCount}
          <span className="text-ink-faint">/{group.items.length}</span>
        </span>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tracker.searchPlaceholder')}
          className="panel min-w-0 flex-1 bg-stone px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {(['all', 'pending', 'done'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`panel px-2.5 py-2 text-xs transition-colors ${filter === f ? 'text-jade' : 'text-ink-faint'}`}
          >
            {t(`tracker.${f === 'all' ? 'all' : f}`)}
          </button>
        ))}
      </div>

      {items.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">{t('tracker.empty')}</p>}

      <ul className="space-y-1">
        {items.map((item) => {
          const fromSaveDone = !!saveSet[item.id]
          const done = !!(manualSet[item.id] || fromSaveDone)
          const label = ('label' in item && item.label) || ('note' in item && (item as { note?: string }).note) || item.id
          return (
            <li key={item.id} style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 46px' }}>
              <button
                onClick={() => toggleManual(group.id, item.id)}
                className="panel flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:border-edge-lit"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${done ? 'rune-pulse' : ''}`}
                  style={{
                    borderColor: done ? 'var(--color-jade)' : 'var(--color-edge-lit)',
                    background: done ? 'var(--color-jade)' : 'transparent',
                    boxShadow: done ? 'var(--glow-jade)' : undefined,
                  }}
                >
                  {done && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6.5 5 9l5-6" stroke="var(--color-abyss)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`min-w-0 flex-1 truncate text-sm ${done ? 'text-ink-mute line-through decoration-edge-lit' : 'text-ink'}`}>
                  {label}
                </span>
                {fromSaveDone && (
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-jade-deep" title={t('save.detected')}>
                    sav
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
