import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { useDataset } from '../lib/useDataset'
import { buildArmor, buildKeyItems, buildMaterials } from '../lib/inventory'
import { getSessionSave } from '../lib/saveSession'

type Tab = 'materials' | 'key_items' | 'armor'

export function Inventory() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const [tab, setTab] = useState<Tab>('materials')
  const [query, setQuery] = useState('')
  const hasSession = !!getSessionSave()

  const materials = useMemo(() => buildMaterials(data, manual, fromSave), [data, manual, fromSave])
  const keyItems = useMemo(() => buildKeyItems(data, manual, fromSave), [data, manual, fromSave])
  const armor = useMemo(() => buildArmor(data, manual, fromSave), [data, manual, fromSave])

  const q = query.trim().toLowerCase()
  const filteredMaterials = materials
    .filter((m) => !q || m.label.toLowerCase().includes(q))
    .sort((a, b) => (b.qty ?? (b.owned ? 1 : 0)) - (a.qty ?? (a.owned ? 1 : 0)) || a.label.localeCompare(b.label))
  const filteredKeyItems = keyItems
    .filter((k) => !q || k.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.label.localeCompare(b.label))
  const filteredArmor = armor
    .filter((a) => !q || a.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || (b.stars ?? -1) - (a.stars ?? -1) || a.label.localeCompare(b.label))

  const ownedMaterials = materials.filter((m) => m.owned).length
  const ownedKeyItems = keyItems.filter((k) => k.owned).length
  const ownedArmor = armor.filter((a) => a.owned).length

  const TABS: { id: Tab; label: string; count: string }[] = [
    { id: 'materials', label: t('inventory.materials'), count: `${ownedMaterials}/${materials.length}` },
    { id: 'key_items', label: t('inventory.keyItems'), count: `${ownedKeyItems}/${keyItems.length}` },
    { id: 'armor', label: t('inventory.armor'), count: `${ownedArmor}/${armor.length}` },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg">{t('inventory.title')}</h2>
      </div>

      {!hasSession && (
        <p className="panel mb-3 px-3 py-2 text-xs text-ink-mute">{t('inventory.noSession')}</p>
      )}

      <div className="mb-3 flex gap-2">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`panel flex-1 px-2.5 py-2 text-xs transition-colors ${tab === tb.id ? 'text-jade' : 'text-ink-faint'}`}
          >
            {tb.label} <span className="font-mono">{tb.count}</span>
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('tracker.searchPlaceholder')}
        className="panel mb-3 w-full bg-stone px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
      />

      {tab === 'materials' && (
        <ul className="space-y-1">
          {filteredMaterials.map((m) => (
            <li key={m.id} className="panel flex items-center gap-3 px-3 py-2.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 46px' }}>
              <span className={`min-w-0 flex-1 truncate text-sm ${m.owned ? 'text-ink' : 'text-ink-faint'}`}>{m.label}</span>
              {m.qty !== null ? (
                <span className="font-mono text-sm" style={{ color: m.qty > 0 ? 'var(--color-jade)' : 'var(--color-ink-faint)' }}>
                  ×{m.qty}
                </span>
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{m.owned ? t('inventory.owned') : '—'}</span>
              )}
            </li>
          ))}
          {filteredMaterials.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">{t('tracker.empty')}</p>}
        </ul>
      )}

      {tab === 'key_items' && (
        <ul className="space-y-1">
          {filteredKeyItems.map((k) => (
            <li key={k.id} className="panel flex items-center gap-3 px-3 py-2.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 46px' }}>
              <span className={`min-w-0 flex-1 truncate text-sm ${k.owned ? 'text-ink' : 'text-ink-faint'}`}>{k.label}</span>
              {k.owned && (
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.5 5 9l5-6" stroke="var(--color-jade)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </li>
          ))}
          {filteredKeyItems.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">{t('tracker.empty')}</p>}
        </ul>
      )}

      {tab === 'armor' && (
        <ul className="space-y-1">
          {filteredArmor.map((a) => (
            <li key={a.id} className="panel flex items-center gap-3 px-3 py-2.5" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 46px' }}>
              <span className={`min-w-0 flex-1 truncate text-sm ${a.owned ? 'text-ink' : 'text-ink-faint'}`}>{a.label}</span>
              {a.owned ? (
                a.stars !== null ? (
                  <span className="font-mono text-sm" style={{ color: a.stars >= 4 ? 'var(--color-gold)' : 'var(--color-jade)' }}>
                    {'★'.repeat(a.stars) || '0★'}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">{t('inventory.owned')}</span>
                )
              ) : (
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">—</span>
              )}
            </li>
          ))}
          {filteredArmor.length === 0 && <p className="py-8 text-center text-sm text-ink-mute">{t('tracker.empty')}</p>}
        </ul>
      )}
    </div>
  )
}
