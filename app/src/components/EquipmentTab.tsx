import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import type { EquipmentEdit } from '../store/appStore'
import {
  MODIFIERS,
  loadEquipmentCatalog,
  readEquipment,
  type EquipCatalog,
  type EquipCategory,
  type EquipPouch,
  type EquipSlot,
} from '../lib/equipment'
import { ItemIcon } from './ItemIcon'

/**
 * Aba de equipamento do Inventário (arcos / armas / escudos).
 *
 * Diferente das outras abas, cada slot carrega estado próprio — durabilidade,
 * modificador e valor do modificador — então tem grade + painel de detalhe
 * próprios em vez de reaproveitar o `Slot` genérico.
 */
export function EquipmentTab({ category, hasSession }: { category: EquipCategory; hasSession: boolean }) {
  const { t } = useTranslation()
  const grants = useAppStore((s) => s.equipmentGrants)
  const addGrant = useAppStore((s) => s.addEquipmentGrant)
  const removeGrant = useAppStore((s) => s.removeEquipmentGrant)
  const equipmentEdits = useAppStore((s) => s.equipmentEdits)
  const setEquipmentEdit = useAppStore((s) => s.setEquipmentEdit)
  const clearEquipmentEdit = useAppStore((s) => s.clearEquipmentEdit)
  const equipmentDeletes = useAppStore((s) => s.equipmentDeletes)
  const toggleEquipmentDelete = useAppStore((s) => s.toggleEquipmentDelete)

  const [catalog, setCatalog] = useState<EquipCatalog | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadEquipmentCatalog().then((c) => !cancelled && setCatalog(c))
    return () => {
      cancelled = true
    }
  }, [])

  const pouch: EquipPouch | null = useMemo(
    () => (hasSession ? readEquipment(category) : null),
    // relê quando o save da sessão muda (grava/reimporta troca o buffer)
    [category, hasSession],
  )

  const catGrants = grants.map((g, i) => ({ ...g, storeIndex: i })).filter((g) => g.category === category)
  const labelFor = (id: string) => catalog?.[category].find((c) => c.id === id)?.label ?? id

  if (!hasSession) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.noSessionEquip')}</p>
  }
  if (!pouch) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.equipUnavailable')}</p>
  }

  const selected = selectedIdx !== null ? pouch.slots[selectedIdx] : null
  const freeAfterGrants = pouch.freeIndices.length - catGrants.length

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-2">
        <p className="text-xs text-ink-faint">
          {t('inventory.equipCapacity', { used: pouch.slots.length, total: pouch.capacity, free: freeAfterGrants })}
        </p>

        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-8">
          {pouch.slots.map((s, i) => {
            const key = `${category}:${s.index}`
            const edited = !!equipmentEdits[key]
            const deleted = equipmentDeletes.includes(key)
            return (
              <button
                key={`${s.index}-${s.id}`}
                onClick={() => {
                  setSelectedIdx(i)
                  setAdding(false)
                }}
                title={labelFor(s.id)}
                className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5 transition-transform hover:scale-[1.04]"
                style={
                  selectedIdx === i
                    ? { borderColor: 'var(--color-gold)', boxShadow: 'var(--glow-gold)' }
                    : deleted
                      ? { borderColor: 'var(--color-gloom)', opacity: 0.45 }
                      : edited
                        ? { borderColor: 'var(--color-jade)' }
                        : undefined
                }
              >
                <ItemIcon iconId={s.id} fallback="armor" size={24} />
                <span className="absolute bottom-1 right-1.5 font-mono text-[9px] text-ink-mute">
                  {equipmentEdits[key]?.durability ?? s.durability}
                </span>
                {deleted && <span className="absolute inset-0 flex items-center justify-center text-lg text-gloom">✕</span>}
                {!deleted && (edited || s.modifier !== 'None') && (
                  <span className="absolute left-1.5 top-1 font-mono text-[9px]" style={{ color: 'var(--color-jade)' }}>
                    ★
                  </span>
                )}
              </button>
            )
          })}

          {/* itens staged, ainda não gravados */}
          {catGrants.map((g) => (
            <div
              key={`grant-${g.storeIndex}`}
              title={labelFor(g.id)}
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5"
              style={{ borderColor: 'var(--color-jade)', boxShadow: 'var(--glow-jade)' }}
            >
              <ItemIcon iconId={g.id} fallback="armor" size={24} />
              <span className="absolute bottom-1 right-1.5 font-mono text-[9px]" style={{ color: 'var(--color-jade)' }}>
                {g.durability}
              </span>
              <button
                onClick={() => removeGrant(g.storeIndex)}
                className="absolute left-1 top-0.5 text-[10px] text-ink-faint hover:text-gloom"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
          ))}

          {freeAfterGrants > 0 && (
            <button
              onClick={() => {
                setAdding(true)
                setSelectedIdx(null)
              }}
              className="panel flex aspect-square items-center justify-center text-2xl text-ink-faint transition-colors hover:text-jade"
              title={t('inventory.equipAdd')}
            >
              +
            </button>
          )}
        </div>
      </div>

      <aside className="panel h-fit p-4 lg:sticky lg:top-4">
        {adding && catalog ? (
          <AddForm
            category={category}
            catalog={catalog}
            onCancel={() => setAdding(false)}
            onAdd={(g) => {
              addGrant(g)
              setAdding(false)
            }}
          />
        ) : selected ? (
          <SlotEditor
            key={`${category}:${selected.index}`}
            category={category}
            slot={selected}
            label={labelFor(selected.id)}
            edit={equipmentEdits[`${category}:${selected.index}`]}
            deleted={equipmentDeletes.includes(`${category}:${selected.index}`)}
            onEdit={(patch) => setEquipmentEdit(`${category}:${selected.index}`, patch)}
            onReset={() => clearEquipmentEdit(`${category}:${selected.index}`)}
            onToggleDelete={() => toggleEquipmentDelete(`${category}:${selected.index}`)}
          />
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">{t('inventory.selectHint')}</p>
            {catGrants.length > 0 && (
              <Link to="/save" className="block text-xs underline decoration-edge-lit underline-offset-2 hover:text-jade">
                {t('inventory.goToSave')}
              </Link>
            )}
          </div>
        )}
      </aside>
    </div>
  )
}

/**
 * Editor de um slot que já existe no save. As mudanças ficam staged no store
 * (como todo o resto do editor) e só tocam o arquivo no "Gravar e baixar" —
 * por isso "Reverter" é sempre possível: o save original nunca foi alterado.
 */
function SlotEditor({
  category,
  slot,
  label,
  edit,
  deleted,
  onEdit,
  onReset,
  onToggleDelete,
}: {
  category: EquipCategory
  slot: EquipSlot
  label: string
  edit?: EquipmentEdit
  deleted: boolean
  onEdit: (patch: EquipmentEdit) => void
  onReset: () => void
  onToggleDelete: () => void
}) {
  const { t } = useTranslation()
  const durability = edit?.durability ?? slot.durability
  const modifier = edit?.modifier ?? slot.modifier
  const modifierValue = edit?.modifierValue ?? slot.modifierValue
  const dirty = !!edit
  const field = 'panel mt-1 w-full bg-stone-2 px-2 py-1.5 text-sm text-ink focus:outline-none'
  // um modificador vindo do save pode não estar na lista (hash desconhecido);
  // incluí-lo evita que abrir o editor troque silenciosamente o valor
  const options = MODIFIERS[category].includes(modifier) ? MODIFIERS[category] : [modifier, ...MODIFIERS[category]]

  return (
    <div className="space-y-3" style={deleted ? { opacity: 0.5 } : undefined}>
      <div className="flex items-center justify-center py-2">
        <ItemIcon iconId={slot.id} fallback="armor" size={72} />
      </div>
      <div>
        <h3 className="font-display text-base leading-tight">{label}</h3>
        <p className="font-mono text-[10px] text-ink-faint">{slot.id}</p>
      </div>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.durability')}
        <input
          type="number"
          min={1}
          max={9999}
          disabled={deleted}
          value={durability}
          onChange={(e) => onEdit({ durability: Number(e.target.value) })}
          className={`${field} font-mono`}
          style={edit?.durability !== undefined ? { borderColor: 'var(--color-jade)' } : undefined}
        />
      </label>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.modifier')}
        <select
          value={modifier}
          disabled={deleted}
          onChange={(e) => onEdit({ modifier: e.target.value })}
          className={field}
          style={edit?.modifier !== undefined ? { borderColor: 'var(--color-jade)' } : undefined}
        >
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {modifier !== 'None' && (
        <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
          {t('inventory.modifierValue')}
          <input
            type="number"
            min={0}
            max={999}
            disabled={deleted}
            value={modifierValue}
            onChange={(e) => onEdit({ modifierValue: Number(e.target.value) })}
            className={`${field} font-mono`}
            style={edit?.modifierValue !== undefined ? { borderColor: 'var(--color-jade)' } : undefined}
          />
        </label>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {dirty && !deleted && (
          <button onClick={onReset} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
            {t('inventory.resetSlot')}
          </button>
        )}
        <button
          onClick={onToggleDelete}
          className="panel px-3 py-2 text-xs"
          style={{ color: deleted ? 'var(--color-jade)' : 'var(--color-gloom)' }}
        >
          {deleted ? t('inventory.undoDelete') : t('inventory.deleteSlot')}
        </button>
      </div>

      {deleted && <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-gloom)' }}>{t('inventory.deleteSlotHint')}</p>}
      {(dirty || deleted) && (
        <Link to="/save" className="block text-xs underline decoration-edge-lit underline-offset-2 hover:text-jade">
          {t('inventory.goToSave')}
        </Link>
      )}
    </div>
  )
}

function AddForm({
  category,
  catalog,
  onAdd,
  onCancel,
}: {
  category: EquipCategory
  catalog: EquipCatalog
  onAdd: (g: { category: EquipCategory; id: string; durability: number; modifier: string; modifierValue: number }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const items = catalog[category]
  const [id, setId] = useState(items[0]?.id ?? '')
  const [modifier, setModifier] = useState('None')
  const [modifierValue, setModifierValue] = useState(10)
  const chosen = items.find((i) => i.id === id)
  const [durability, setDurability] = useState<number | null>(null)
  const effectiveDur = durability ?? chosen?.durability ?? 70

  const field = 'panel mt-1 w-full bg-stone-2 px-2 py-1.5 text-sm text-ink focus:outline-none'

  return (
    <div className="space-y-3">
      <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('inventory.equipAdd')}</h3>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.equipItem')}
        <select
          value={id}
          onChange={(e) => {
            setId(e.target.value)
            setDurability(null)
          }}
          className={field}
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.durability')}
        <input
          type="number"
          min={1}
          max={9999}
          value={effectiveDur}
          onChange={(e) => setDurability(Number(e.target.value))}
          className={`${field} font-mono`}
        />
      </label>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.modifier')}
        <select value={modifier} onChange={(e) => setModifier(e.target.value)} className={field}>
          {MODIFIERS[category].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      {modifier !== 'None' && (
        <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
          {t('inventory.modifierValue')}
          <input
            type="number"
            min={1}
            max={120}
            value={modifierValue}
            onChange={(e) => setModifierValue(Number(e.target.value))}
            className={`${field} font-mono`}
          />
        </label>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onAdd({ category, id, durability: effectiveDur, modifier, modifierValue })}
          className="btn-jade flex-1 text-center"
        >
          {t('inventory.grant')}
        </button>
        <button onClick={onCancel} className="panel px-3 py-2 text-xs text-ink-mute hover:text-gloom">
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
