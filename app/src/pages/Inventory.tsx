import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { useDataset } from '../lib/useDataset'
import { buildArmor, buildKeyItems, buildMaterials, buildToggleable, type ArmorEntry, type KeyItemEntry, type MaterialEntry, type ToggleableEntry } from '../lib/inventory'
import { getSessionSave } from '../lib/saveSession'
import { TypeIcon, type IconKind } from '../components/TypeIcon'

type Tab = 'materials' | 'key_items' | 'armor' | 'fabrics' | 'fabrics_amiibo'

const TAB_ICON: Record<Tab, IconKind> = {
  materials: 'fruit',
  key_items: 'key',
  armor: 'armor',
  fabrics: 'fabric',
  fabrics_amiibo: 'fabric',
}

export function Inventory() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const toggleManual = useAppStore((s) => s.toggleManual)
  const [tab, setTab] = useState<Tab>('materials')
  const [query, setQuery] = useState('')
  const hasSession = !!getSessionSave()

  const materials = useMemo(() => buildMaterials(data, manual, fromSave), [data, manual, fromSave])
  const keyItems = useMemo(() => buildKeyItems(data, manual, fromSave), [data, manual, fromSave])
  const armor = useMemo(() => buildArmor(data, manual, fromSave), [data, manual, fromSave])
  const fabrics = useMemo(() => buildToggleable(data, manual, fromSave, 'fabrics'), [data, manual, fromSave])
  const amiibo = useMemo(() => buildToggleable(data, manual, fromSave, 'fabrics_amiibo'), [data, manual, fromSave])

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
  const filteredFabrics = fabrics
    .filter((f) => !q || f.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.label.localeCompare(b.label))
  const filteredAmiibo = amiibo
    .filter((f) => !q || f.label.toLowerCase().includes(q))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || a.label.localeCompare(b.label))

  const counts: Record<Tab, string> = {
    materials: `${materials.filter((m) => m.owned).length}/${materials.length}`,
    key_items: `${keyItems.filter((k) => k.owned).length}/${keyItems.length}`,
    armor: `${armor.filter((a) => a.owned).length}/${armor.length}`,
    fabrics: `${fabrics.filter((f) => f.owned).length}/${fabrics.length}`,
    fabrics_amiibo: `${amiibo.filter((f) => f.owned).length}/${amiibo.length}`,
  }

  const anyStaged = fabrics.some((f) => f.staged) || amiibo.some((f) => f.staged)

  const TABS: Tab[] = ['materials', 'key_items', 'armor', 'fabrics', 'fabrics_amiibo']
  const tabLabel = (tb: Tab): string => {
    if (tb === 'fabrics' || tb === 'fabrics_amiibo') {
      const key = `groups.${tb}`
      const translated = t(key)
      if (translated !== key) return translated
      return data.stats.find((s) => s.id === tb)?.label ?? tb
    }
    return t(`inventory.${tb === 'key_items' ? 'keyItems' : tb}`)
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg">{t('inventory.title')}</h2>
      </div>

      {!hasSession && <p className="panel mb-3 px-3 py-2 text-xs text-ink-mute">{t('inventory.noSession')}</p>}

      {/* barra de abas estilo menu do jogo (L ... R) */}
      <div className="panel mb-3 flex items-center gap-1 overflow-x-auto p-1.5">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className="flex shrink-0 flex-col items-center gap-1 px-3 py-2 transition-colors"
            style={{ color: tab === tb ? 'var(--color-jade)' : 'var(--color-ink-faint)' }}
          >
            <TypeIcon kind={TAB_ICON[tb]} size={20} />
            <span className="max-w-16 truncate text-[10px]">{tabLabel(tb)}</span>
            <span className="font-mono text-[9px] text-ink-faint">{counts[tb]}</span>
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('tracker.searchPlaceholder')}
        className="panel mb-3 w-full bg-stone px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
      />

      {(tab === 'fabrics' || tab === 'fabrics_amiibo') && (
        <p className="mb-3 text-xs text-ink-faint">
          {anyStaged ? t('inventory.editHintStaged') : t('inventory.editHint')}{' '}
          {anyStaged && (
            <Link to="/save" className="underline decoration-edge-lit underline-offset-2 hover:text-jade">
              {t('inventory.goToSave')}
            </Link>
          )}
        </p>
      )}

      {tab === 'materials' && <MaterialGrid items={filteredMaterials} />}
      {tab === 'key_items' && <KeyItemGrid items={filteredKeyItems} />}
      {tab === 'armor' && <ArmorGrid items={filteredArmor} />}
      {tab === 'fabrics' && <ToggleGrid items={filteredFabrics} onToggle={toggleManual} />}
      {tab === 'fabrics_amiibo' && <ToggleGrid items={filteredAmiibo} onToggle={toggleManual} />}
    </div>
  )
}

function GridShell({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  const { t } = useTranslation()
  if (empty) return <p className="py-8 text-center text-sm text-ink-mute">{t('tracker.empty')}</p>
  return <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">{children}</div>
}

function Card({
  icon,
  label,
  badge,
  dim,
  ring,
  onClick,
}: {
  icon: IconKind
  label: string
  badge?: React.ReactNode
  dim?: boolean
  ring?: 'jade' | 'gold' | 'none'
  onClick?: () => void
}) {
  const As = onClick ? 'button' : 'div'
  return (
    <As
      onClick={onClick}
      className={`panel relative flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center transition-transform ${onClick ? 'cursor-pointer hover:scale-[1.03]' : ''} ${ring === 'jade' ? 'rune-pulse' : ''}`}
      style={{
        opacity: dim ? 0.45 : 1,
        borderColor: ring === 'gold' ? 'var(--color-gold)' : ring === 'jade' ? 'var(--color-jade)' : undefined,
        boxShadow: ring === 'gold' ? 'var(--glow-gold)' : ring === 'jade' ? 'var(--glow-jade)' : undefined,
      }}
    >
      <span style={{ color: dim ? 'var(--color-ink-faint)' : 'var(--color-ink)' }}>
        <TypeIcon kind={icon} size={26} />
      </span>
      <span className="line-clamp-2 min-w-0 text-[10px] leading-tight text-ink-mute">{label}</span>
      {badge && <span className="absolute right-1 top-1">{badge}</span>}
    </As>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 font-mono text-[9px] font-medium" style={{ background: 'var(--color-abyss)', color, boxShadow: `0 0 0 1px ${color}55` }}>
      {children}
    </span>
  )
}

function MaterialGrid({ items }: { items: MaterialEntry[] }) {
  return (
    <GridShell empty={items.length === 0}>
      {items.map((m) => (
        <Card
          key={m.id}
          icon={m.bucket}
          label={m.label}
          dim={!m.owned}
          badge={
            m.qty !== null ? (
              <Badge color={m.qty > 0 ? 'var(--color-jade)' : 'var(--color-ink-faint)'}>×{m.qty}</Badge>
            ) : m.owned ? (
              <Badge color="var(--color-jade)">✓</Badge>
            ) : undefined
          }
        />
      ))}
    </GridShell>
  )
}

function KeyItemGrid({ items }: { items: KeyItemEntry[] }) {
  return (
    <GridShell empty={items.length === 0}>
      {items.map((k) => (
        <Card key={k.id} icon="key" label={k.label} dim={!k.owned} badge={k.owned ? <Badge color="var(--color-jade)">✓</Badge> : undefined} />
      ))}
    </GridShell>
  )
}

function ArmorGrid({ items }: { items: ArmorEntry[] }) {
  return (
    <GridShell empty={items.length === 0}>
      {items.map((a) => (
        <Card
          key={a.id}
          icon="armor"
          label={a.label}
          dim={!a.owned}
          badge={
            a.owned ? (
              a.stars !== null ? (
                <Badge color={a.stars >= 4 ? 'var(--color-gold)' : 'var(--color-jade)'}>{'★'.repeat(a.stars) || '0★'}</Badge>
              ) : (
                <Badge color="var(--color-jade)">✓</Badge>
              )
            ) : undefined
          }
        />
      ))}
    </GridShell>
  )
}

function ToggleGrid({ items, onToggle }: { items: ToggleableEntry[]; onToggle: (groupId: string, itemId: string) => void }) {
  const { t } = useTranslation()
  return (
    <GridShell empty={items.length === 0}>
      {items.map((f) => (
        <Card
          key={f.id}
          icon="fabric"
          label={f.label}
          dim={!f.owned}
          ring={f.staged ? 'jade' : f.owned ? 'gold' : 'none'}
          onClick={() => onToggle(f.groupId, f.id)}
          badge={
            f.staged ? (
              <Badge color="var(--color-jade)">{t('inventory.staged')}</Badge>
            ) : f.owned ? (
              <Badge color="var(--color-gold)">{t('save.detected')}</Badge>
            ) : undefined
          }
        />
      ))}
    </GridShell>
  )
}
