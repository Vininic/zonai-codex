import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import { useDataset } from '../lib/useDataset'
import { armorUpgradeNeeds, buildArmor, buildKeyItems, buildMaterials, buildToggleable } from '../lib/inventory'
import { getSessionSave } from '../lib/saveSession'
import { TypeIcon, type IconKind } from '../components/TypeIcon'
import { EquipmentTab } from '../components/EquipmentTab'
import type { EquipCategory } from '../lib/equipment'
import type { MaterialBucket } from '../lib/materialIcon'

type Tab = 'materials' | 'key_items' | 'armor' | 'fabrics' | 'fabrics_amiibo' | 'bows' | 'weapons' | 'shields'

/** abas de equipamento têm dados próprios (durabilidade/modificador) e UI própria */
const EQUIP_TABS = ['bows', 'weapons', 'shields'] as const
const isEquipTab = (t: Tab): t is EquipCategory => (EQUIP_TABS as readonly string[]).includes(t)

const TAB_ICON: Record<Tab, IconKind> = {
  materials: 'fruit',
  key_items: 'key',
  armor: 'armor',
  fabrics: 'fabric',
  fabrics_amiibo: 'fabric',
  bows: 'armor',
  weapons: 'armor',
  shields: 'armor',
}

/**
 * Um slot do pouch, normalizado — as 5 abas têm dados de origem diferentes
 * (quantidade, estrelas, posse) mas a grade e o painel de detalhe são um só.
 */
interface Slot {
  id: string
  label: string
  icon: IconKind
  /** materiais: quantidade efetiva; demais: null */
  qty: number | null
  /** armaduras: 0-4; demais: null */
  stars: number | null
  owned: boolean
  staged: boolean
  /** confirmado pelo save — o arquivo é a fonte de verdade, não dá pra desmarcar */
  locked: boolean
  /** rótulo do tipo, no painel de detalhe */
  kindKey: string
}

export function Inventory() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const toggleManual = useAppStore((s) => s.toggleManual)
  const materialQty = useAppStore((s) => s.materialQty)
  const setMaterialQty = useAppStore((s) => s.setMaterialQty)
  const clearMaterialQty = useAppStore((s) => s.clearMaterialQty)
  const setMaterialQtyBulk = useAppStore((s) => s.setMaterialQtyBulk)

  const [tab, setTab] = useState<Tab>('materials')
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filled, setFilled] = useState<number | null>(null)
  const hasSession = !!getSessionSave()

  const materials = useMemo(() => buildMaterials(data, manual, fromSave, materialQty), [data, manual, fromSave, materialQty])
  const keyItems = useMemo(() => buildKeyItems(data, manual, fromSave), [data, manual, fromSave])
  const armor = useMemo(() => buildArmor(data, manual, fromSave), [data, manual, fromSave])
  const fabrics = useMemo(() => buildToggleable(data, manual, fromSave, 'fabrics'), [data, manual, fromSave])
  const amiibo = useMemo(() => buildToggleable(data, manual, fromSave, 'fabrics_amiibo'), [data, manual, fromSave])

  /** ordem do array = ordem do dataset = ordem canônica do jogo (frutas →
   *  cogumelos → plantas → carnes → peixes → insetos → minérios → monstro →
   *  zonai). O array do próprio save está em ordem de COLETA, que não é a que
   *  o jogo mostra — por isso não reordenamos por nada aqui. */
  const slotsByTab: Record<Tab, Slot[]> = useMemo(
    () => ({
      materials: materials.map((m) => ({
        id: m.id,
        label: m.label,
        icon: m.bucket as IconKind,
        qty: m.qty,
        stars: null,
        owned: m.owned || (m.qty ?? 0) > 0,
        staged: m.staged,
        // materiais não usam o botão de toggle (têm campo de quantidade), então
        // `locked` aqui só serve pro selo "detectado do save" no painel
        locked: (m.rawQty ?? 0) > 0,
        kindKey: `inventory.bucket.${m.bucket satisfies MaterialBucket}`,
      })),
      key_items: keyItems.map((k) => ({
        id: k.id,
        label: k.label,
        icon: 'key' as IconKind,
        qty: null,
        stars: null,
        owned: k.owned,
        staged: k.staged,
        locked: k.locked,
        kindKey: 'inventory.keyItems',
      })),
      armor: armor.map((a) => ({
        id: a.id,
        label: a.label,
        icon: 'armor' as IconKind,
        qty: null,
        stars: a.stars,
        owned: a.owned,
        staged: a.staged,
        locked: a.locked,
        kindKey: 'inventory.armor',
      })),
      fabrics: fabrics.map((f) => ({
        id: f.id,
        label: f.label,
        icon: 'fabric' as IconKind,
        qty: null,
        stars: null,
        owned: f.owned,
        staged: f.staged,
        locked: f.locked,
        kindKey: 'inventory.fabrics',
      })),
      fabrics_amiibo: amiibo.map((f) => ({
        id: f.id,
        label: f.label,
        icon: 'fabric' as IconKind,
        qty: null,
        stars: null,
        owned: f.owned,
        staged: f.staged,
        locked: f.locked,
        kindKey: 'inventory.amiibo',
      })),
      // as abas de equipamento renderizam <EquipmentTab/> e não usam esta lista
      bows: [],
      weapons: [],
      shields: [],
    }),
    [materials, keyItems, armor, fabrics, amiibo],
  )

  const all = slotsByTab[tab]
  const q = query.trim().toLowerCase()
  const slots = all.filter((s) => {
    if (!showAll && !s.owned && !s.staged) return false
    if (q && !s.label.toLowerCase().includes(q)) return false
    return true
  })

  const selected = slots.find((s) => s.id === selectedId) ?? slots[0] ?? null

  const TABS: Tab[] = ['materials', 'key_items', 'armor', 'fabrics', 'fabrics_amiibo', 'bows', 'weapons', 'shields']
  const tabLabel = (tb: Tab): string => {
    if (tb === 'fabrics' || tb === 'fabrics_amiibo') {
      const key = `groups.${tb}`
      const translated = t(key)
      if (translated !== key) return translated
      return data.stats.find((s) => s.id === tb)?.label ?? tb
    }
    return t(`inventory.${tb === 'key_items' ? 'keyItems' : tb}`)
  }
  const ownedCount = (tb: Tab) => slotsByTab[tb].filter((s) => s.owned).length

  const anyStagedInTab = all.some((s) => s.staged)

  const commitQty = (id: string, raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    setMaterialQty(id, Math.max(0, Math.min(999, Math.round(n))))
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg">{t('inventory.title')}</h2>
        {anyStagedInTab && (
          <Link to="/save" className="text-xs underline decoration-edge-lit underline-offset-2 hover:text-jade">
            {t('inventory.goToSave')}
          </Link>
        )}
      </div>

      {!hasSession && <p className="panel mb-3 px-3 py-2 text-xs text-ink-mute">{t('inventory.noSession')}</p>}

      {/* faixa de abas, estilo menu do jogo */}
      <div className="panel mb-3 flex items-center gap-1 overflow-x-auto p-1.5">
        {TABS.map((tb) => (
          <button
            key={tb}
            onClick={() => {
              setTab(tb)
              setSelectedId(null)
            }}
            className="flex shrink-0 flex-col items-center gap-1 px-3 py-2 transition-colors"
            style={{ color: tab === tb ? 'var(--color-jade)' : 'var(--color-ink-faint)' }}
          >
            <TypeIcon kind={TAB_ICON[tb]} size={20} />
            <span className="max-w-16 truncate text-[10px]">{tabLabel(tb)}</span>
            {!isEquipTab(tb) && (
              <span className="font-mono text-[9px] text-ink-faint">
                {ownedCount(tb)}/{slotsByTab[tb].length}
              </span>
            )}
          </button>
        ))}
      </div>

      {isEquipTab(tab) && <EquipmentTab category={tab} hasSession={hasSession} />}

      {!isEquipTab(tab) && (
      <>
      <div className="mb-3 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('tracker.searchPlaceholder')}
          className="panel min-w-0 flex-1 bg-stone px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          onClick={() => setShowAll((v) => !v)}
          className="panel shrink-0 px-3 py-2 text-xs transition-colors"
          style={{ color: showAll ? 'var(--color-gold)' : 'var(--color-jade)' }}
          title={t('inventory.viewHint')}
        >
          {showAll ? t('inventory.viewAll') : t('inventory.viewOwned')}
        </button>
        {tab === 'materials' && hasSession && (
          <button
            onClick={() => {
              const { targets, rows } = armorUpgradeNeeds(data, manual, fromSave)
              setMaterialQtyBulk(targets)
              setFilled(rows.length)
            }}
            className="panel shrink-0 px-3 py-2 text-xs text-ink-mute transition-colors hover:text-jade"
            title={t('inventory.fillUpgradeHint')}
          >
            {t('inventory.fillUpgrade')}
          </button>
        )}
      </div>

      {filled !== null && (
        <p className="mb-3 text-xs" style={{ color: 'var(--color-jade)' }}>
          {filled === 0 ? t('inventory.fillUpgradeNone') : t('inventory.fillUpgradeDone', { count: filled })}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
        {/* grade de slots */}
        {slots.length === 0 ? (
          <p className="panel px-3 py-8 text-center text-sm text-ink-mute">
            {showAll ? t('tracker.empty') : t('inventory.emptyOwned')}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-8">
            {slots.map((s) => {
              const isSel = selected?.id === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  title={s.label}
                  className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5 transition-transform hover:scale-[1.04]"
                  style={{
                    opacity: s.owned || s.staged ? 1 : 0.4,
                    borderColor: isSel ? 'var(--color-gold)' : s.staged ? 'var(--color-jade)' : undefined,
                    boxShadow: isSel ? 'var(--glow-gold)' : s.staged ? 'var(--glow-jade)' : undefined,
                  }}
                >
                  <span style={{ color: s.owned || s.staged ? 'var(--color-ink)' : 'var(--color-ink-faint)' }}>
                    <TypeIcon kind={s.icon} size={26} />
                  </span>
                  {s.qty !== null && s.qty > 0 && (
                    <span
                      className="absolute bottom-1 right-1.5 font-mono text-[10px] font-medium"
                      style={{ color: s.staged ? 'var(--color-jade)' : 'var(--color-ink-mute)' }}
                    >
                      ×{s.qty}
                    </span>
                  )}
                  {s.stars !== null && s.stars > 0 && (
                    <span className="absolute bottom-1 right-1.5 font-mono text-[9px]" style={{ color: 'var(--color-gold)' }}>
                      {'★'.repeat(s.stars)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* painel de detalhe fixo, como o do jogo */}
        <aside className="panel flex h-fit flex-col gap-3 p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="text-xs text-ink-faint">{t('inventory.selectHint')}</p>
          ) : (
            <>
              <div className="flex items-center justify-center py-2" style={{ color: 'var(--color-ink)' }}>
                <TypeIcon kind={selected.icon} size={52} />
              </div>
              <div>
                <h3 className="font-display text-base leading-tight">{selected.label}</h3>
                <p className="mt-0.5 text-[10px] uppercase tracking-widest text-ink-faint">{t(selected.kindKey)}</p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {selected.locked && (
                  <span className="border border-edge px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ color: 'var(--color-gold)' }}>
                    {t('save.detected')}
                  </span>
                )}
                {selected.staged && (
                  <span className="border border-edge px-1.5 py-0.5 font-mono text-[9px] uppercase" style={{ color: 'var(--color-jade)' }}>
                    {t('inventory.staged')}
                  </span>
                )}
                {!selected.owned && !selected.staged && (
                  <span className="border border-edge px-1.5 py-0.5 font-mono text-[9px] uppercase text-ink-faint">
                    {t('inventory.notOwned')}
                  </span>
                )}
              </div>

              {tab === 'materials' ? (
                hasSession ? (
                  <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-ink-mute">
                    {t('inventory.quantity')}
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        value={selected.qty ?? 0}
                        onChange={(e) => commitQty(selected.id, e.target.value)}
                        className="panel min-w-0 flex-1 bg-stone-2 px-2 py-1.5 text-center font-mono text-sm text-ink focus:outline-none"
                      />
                      {selected.staged && (
                        <button
                          onClick={() => clearMaterialQty(selected.id)}
                          className="panel px-2 py-1.5 font-mono text-xs text-ink-faint hover:text-gloom"
                          title={t('inventory.reset')}
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </label>
                ) : (
                  <p className="text-[11px] text-ink-faint">{t('inventory.noSessionQty')}</p>
                )
              ) : selected.locked ? (
                // já está no save — nada a fazer aqui; o arquivo é a fonte de verdade
                <p className="text-[11px] text-ink-faint">{t('inventory.alreadyInSave')}</p>
              ) : (
                <button onClick={() => toggleManual(tabGroupId(tab), selected.id)} className="btn-jade w-full text-center">
                  {selected.staged ? t('inventory.unmark') : t('inventory.grant')}
                </button>
              )}

              <p className="text-[10px] leading-relaxed text-ink-faint">
                {tab === 'materials' ? t('inventory.editHintQty') : t('inventory.editHint')}
              </p>
            </>
          )}
        </aside>
      </div>
      </>
      )}
    </div>
  )
}

/** aba → id do grupo no dataset (materiais não usam toggle) */
function tabGroupId(tab: Tab): string {
  return tab === 'armor' ? 'armor_inventory' : tab
}
