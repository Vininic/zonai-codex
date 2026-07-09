import { useTranslation } from 'react-i18next'
import type { ImportDiff } from '../store/appStore'
import { useDataset } from '../lib/useDataset'
import { itemLabel } from '../lib/itemLabel'

/** diff estilo git do import: + conquistas novas (jade), − regressões (gloom) */
export function DiffView({ diff }: { diff: ImportDiff }) {
  const { t } = useTranslation()
  const data = useDataset()

  const labelOf = (groupId: string, itemId: string): string => {
    const group = data.categories.find((c) => c.id === groupId) ?? data.stats.find((s) => s.id === groupId)
    const item = group?.items.find((i) => i.id === itemId)
    return item ? itemLabel(item) : itemId
  }

  const groupName = (id: string): string => {
    const key = `groups.${id}`
    const translated = t(key)
    if (translated !== key) return translated
    const group = data.categories.find((c) => c.id === id) ?? data.stats.find((s) => s.id === id)
    return group?.label ?? id
  }

  const totalAdded = diff.groups.reduce((n, g) => n + g.added.length, 0)
  const totalRemoved = diff.groups.reduce((n, g) => n + g.removed.length, 0)
  const empty = totalAdded === 0 && totalRemoved === 0 && diff.player.length === 0

  return (
    <section className="panel space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('diff.title')}</h3>
        {!empty && (
          <span className="font-mono text-xs">
            <span style={{ color: 'var(--color-jade)' }}>+{totalAdded}</span>{' '}
            <span style={{ color: 'var(--color-gloom)' }}>−{totalRemoved}</span>
          </span>
        )}
      </div>
      <p className="font-mono text-[11px] text-ink-faint">
        {diff.fromFile} → {diff.toFile}
      </p>

      {empty && <p className="text-sm text-ink-mute">{t('diff.empty')}</p>}

      {diff.player.length > 0 && (
        <ul className="space-y-0.5 font-mono text-xs">
          {diff.player.map((d) => (
            <li key={d.key} className="flex justify-between">
              <span className="text-ink-mute">{t(`hud.${d.key}`)}</span>
              <span>
                <span className="text-ink-faint">{d.from}</span>
                <span className="text-ink-faint"> → </span>
                <span style={{ color: d.to >= d.from ? 'var(--color-jade)' : 'var(--color-gloom)' }}>{d.to}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {diff.groups.map((g) => (
        <details key={g.groupId} className="group">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-2 py-1 text-sm">
            <span className="text-ink">
              <span className="mr-1 inline-block text-ink-faint transition-transform group-open:rotate-90">›</span>
              {groupName(g.groupId)}
            </span>
            <span className="font-mono text-xs">
              {g.added.length > 0 && <span style={{ color: 'var(--color-jade)' }}>+{g.added.length}</span>}{' '}
              {g.removed.length > 0 && <span style={{ color: 'var(--color-gloom)' }}>−{g.removed.length}</span>}
            </span>
          </summary>
          <ul className="mb-2 ml-4 space-y-0.5 border-l border-edge pl-3 font-mono text-xs">
            {g.added.map((id) => (
              <li key={id} className="truncate" style={{ color: 'var(--color-jade)' }}>
                + {labelOf(g.groupId, id)}
              </li>
            ))}
            {g.removed.map((id) => (
              <li key={id} className="truncate" style={{ color: 'var(--color-gloom)' }}>
                − {labelOf(g.groupId, id)}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}
