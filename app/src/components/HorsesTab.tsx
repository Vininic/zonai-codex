import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../store/appStore'
import type { HorseEdit } from '../store/appStore'
import { Link } from 'react-router-dom'
import { loadHorseCatalog, readHorses, MANES, SADDLES, REINS, type HorseCatalogItem, type HorsePouch, type HorseSlot } from '../lib/horse'
import { ItemIcon } from './ItemIcon'

/**
 * Aba de cavalos — lista o estábulo (leitura, o formato tem 30 campos por
 * cavalo e a maioria não vale a pena editar) + a única ação de escrita que
 * importa aqui: soltar a Epona, cavalo exclusivo de amiibo sem outra forma
 * de obter no jogo (ver lib/horse.ts).
 */
export function HorsesTab({ hasSession }: { hasSession: boolean }) {
  const { t } = useTranslation()
  const grantEpona = useAppStore((s) => s.grantEpona)
  const setGrantEpona = useAppStore((s) => s.setGrantEpona)
  const horseEdits = useAppStore((s) => s.horseEdits)
  const setHorseEdit = useAppStore((s) => s.setHorseEdit)
  const clearHorseEdit = useAppStore((s) => s.clearHorseEdit)
  const horseDeletes = useAppStore((s) => s.horseDeletes)
  const toggleHorseDelete = useAppStore((s) => s.toggleHorseDelete)
  const [catalog, setCatalog] = useState<HorseCatalogItem[] | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    loadHorseCatalog().then((c) => !cancelled && setCatalog(c))
    return () => {
      cancelled = true
    }
  }, [])

  const pouch: HorsePouch | null = useMemo(() => (hasSession ? readHorses() : null), [hasSession])
  const labelFor = (id: string) => catalog?.find((c) => c.id === id)?.label ?? id

  if (!hasSession) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.noSessionEquip')}</p>
  }
  if (!pouch) {
    return <p className="panel px-3 py-6 text-center text-xs text-ink-mute">{t('inventory.equipUnavailable')}</p>
  }

  const canGrantEpona = !pouch.hasEpona && !grantEpona && pouch.freeIndices.length > 0
  const selected = selectedIdx !== null ? pouch.slots[selectedIdx] : null

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_24rem]">
      <div className="space-y-3">
        <p className="text-xs text-ink-faint">
          {t('inventory.equipCapacity', { used: pouch.slots.length, total: pouch.capacity, free: pouch.freeIndices.length })}
        </p>

        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-6 xl:grid-cols-8">
          {pouch.slots.map((s, i) => {
            const edited = !!horseEdits[s.index]
            const deleted = horseDeletes.includes(s.index)
            return (
              <button
                key={`${s.index}-${s.id}`}
                onClick={() => setSelectedIdx(i)}
                title={s.name ? `${s.name} (${labelFor(s.id)})` : labelFor(s.id)}
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
                <ItemIcon iconId={s.id} fallback="horse" size={24} />
                {deleted && <span className="absolute inset-0 flex items-center justify-center text-lg text-gloom">✕</span>}
                {!deleted && (
                  <span className="absolute bottom-1 right-1 max-w-full truncate font-mono text-[8px]" style={{ color: edited ? 'var(--color-jade)' : 'var(--color-ink-mute)' }}>
                    {horseEdits[s.index]?.name ?? s.name}
                  </span>
                )}
              </button>
            )
          })}

          {canGrantEpona && (
            <button
              onClick={() => setGrantEpona(true)}
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5 transition-transform hover:scale-[1.04]"
              style={{ borderColor: 'var(--color-jade)' }}
              title={t('inventory.unlockEpona')}
            >
              <ItemIcon iconId="GameRomHorseEpona" fallback="horse" size={26} />
              <span className="text-[9px] text-jade">+</span>
            </button>
          )}

          {grantEpona && (
            <div
              className="panel relative flex aspect-square flex-col items-center justify-center gap-1 p-1.5"
              style={{ borderColor: 'var(--color-jade)', boxShadow: 'var(--glow-jade)' }}
            >
              <ItemIcon iconId="GameRomHorseEpona" fallback="horse" size={26} />
              <span className="font-mono text-[8px]" style={{ color: 'var(--color-jade)' }}>
                Epona
              </span>
              <button
                onClick={() => setGrantEpona(false)}
                className="absolute left-1 top-0.5 text-[10px] text-ink-faint hover:text-gloom"
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {pouch.hasEpona && <p className="text-xs" style={{ color: 'var(--color-jade)' }}>{t('inventory.eponaOwned')}</p>}
      </div>

      <aside className="panel h-fit p-4 lg:sticky lg:top-4">
        {selected ? (
          <HorseEditor
            key={selected.index}
            horse={selected}
            label={labelFor(selected.id)}
            edit={horseEdits[selected.index]}
            deleted={horseDeletes.includes(selected.index)}
            onEdit={(patch) => setHorseEdit(selected.index, patch)}
            onReset={() => clearHorseEdit(selected.index)}
            onToggleDelete={() => toggleHorseDelete(selected.index)}
          />
        ) : (
          <p className="text-xs text-ink-faint">{t('inventory.horseHint')}</p>
        )}
      </aside>
    </div>
  )
}

/**
 * Editor de um cavalo já existente. Igual ao de equipamento: tudo fica staged
 * no store e só encosta no arquivo no "Gravar e baixar".
 *
 * O nome tem limite de 9 caracteres — é o que cabe no WString16 de 32 bytes
 * do save (16 chars, mas o jogo usa 9) e o mesmo limite do editor de
 * referência. Estoura isso e o nome sai truncado no jogo.
 */
function HorseEditor({
  horse,
  label,
  edit,
  deleted,
  onEdit,
  onReset,
  onToggleDelete,
}: {
  horse: HorseSlot
  label: string
  edit?: HorseEdit
  deleted: boolean
  onEdit: (patch: HorseEdit) => void
  onReset: () => void
  onToggleDelete: () => void
}) {
  const { t } = useTranslation()
  const dirty = !!edit
  const field = 'panel mt-1 w-full bg-stone-2 px-2 py-1.5 text-sm text-ink focus:outline-none'
  const lit = (changed: boolean) => (changed ? { borderColor: 'var(--color-jade)' } : undefined)

  const name = edit?.name ?? horse.name
  const bond = edit?.bond ?? horse.bond
  const strength = edit?.statsStrength ?? horse.statsStrength
  const speed = edit?.statsSpeed ?? horse.statsSpeed
  const stamina = edit?.statsStamina ?? horse.statsStamina
  const pull = edit?.statsPull ?? horse.statsPull

  const withCurrent = (list: string[], current: string) => (list.includes(current) ? list : [current, ...list])
  const enumRow = (labelKey: string, list: string[], current: string, changed: boolean, apply: (v: string) => void) => (
    <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
      {t(labelKey)}
      <select value={current} disabled={deleted} onChange={(e) => apply(e.target.value)} className={field} style={lit(changed)}>
        {withCurrent(list, current).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )
  const starRow = (labelKey: string, value: number, max: number, changed: boolean, apply: (v: number) => void) => (
    <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
      {t(labelKey)}
      <select value={value} disabled={deleted} onChange={(e) => apply(Number(e.target.value))} className={field} style={lit(changed)}>
        {Array.from({ length: max }, (_, i) => i + 1).map((v) => (
          <option key={v} value={v}>
            {'★'.repeat(v)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div className="space-y-3" style={deleted ? { opacity: 0.5 } : undefined}>
      <div className="flex items-center justify-center py-2">
        <ItemIcon iconId={horse.id} fallback="horse" size={72} />
      </div>
      <div>
        <h3 className="font-display text-base leading-tight">{name || label}</h3>
        <p className="font-mono text-[10px] text-ink-faint">{label}</p>
      </div>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.horseName')}
        <input
          type="text"
          maxLength={9}
          disabled={deleted}
          value={name}
          onChange={(e) => onEdit({ name: e.target.value })}
          className={field}
          style={lit(edit?.name !== undefined)}
        />
      </label>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.horseBond')} — {Math.round(bond * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          disabled={deleted}
          value={Math.round(bond * 100)}
          onChange={(e) => onEdit({ bond: Number(e.target.value) / 100 })}
          className="mt-1 w-full accent-jade"
        />
      </label>

      <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
        {t('inventory.horseStrength')}
        <input
          type="number"
          min={100}
          max={350}
          disabled={deleted}
          value={strength}
          onChange={(e) => onEdit({ statsStrength: Number(e.target.value) })}
          className={`${field} font-mono`}
          style={lit(edit?.statsStrength !== undefined)}
        />
      </label>

      {starRow('inventory.horseSpeed', speed, 4, edit?.statsSpeed !== undefined, (v) => onEdit({ statsSpeed: v }))}
      {starRow('inventory.horseStamina', stamina, 5, edit?.statsStamina !== undefined, (v) => onEdit({ statsStamina: v }))}
      {starRow('inventory.horsePull', pull, 4, edit?.statsPull !== undefined, (v) => onEdit({ statsPull: v }))}

      {enumRow('inventory.horseMane', MANES, edit?.mane ?? horse.mane, edit?.mane !== undefined, (v) => onEdit({ mane: v }))}
      {enumRow('inventory.horseSaddle', SADDLES, edit?.saddle ?? horse.saddle, edit?.saddle !== undefined, (v) => onEdit({ saddle: v }))}
      {enumRow('inventory.horseRein', REINS, edit?.rein ?? horse.rein, edit?.rein !== undefined, (v) => onEdit({ rein: v }))}

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
          {deleted ? t('inventory.undoDelete') : t('inventory.deleteHorse')}
        </button>
      </div>

      {deleted && <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-gloom)' }}>{t('inventory.deleteHorseHint')}</p>}
      {(dirty || deleted) && (
        <Link to="/save" className="block text-xs underline decoration-edge-lit underline-offset-2 hover:text-jade">
          {t('inventory.goToSave')}
        </Link>
      )}
    </div>
  )
}
