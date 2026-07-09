import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { planRoute, progressBrief } from '../lib/planner'
import { purahNarration } from '../lib/purah'
import { useAppStore } from '../store/appStore'

const LAYERS = ['surface', 'sky', 'depths'] as const
/** foco default: o que mais rende numa sessão de exploração */
const DEFAULT_FOCUS = ['shrines', 'lightroots', 'koroks', 'caves', 'towers']

export function Companion() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const player = useAppStore((s) => s.player)
  const route = useAppStore((s) => s.route)
  const setRoute = useAppStore((s) => s.setRoute)
  const geminiKey = useAppStore((s) => s.geminiKey)
  const setGeminiKey = useAppStore((s) => s.setGeminiKey)
  const lang = useAppStore((s) => s.lang)

  const [focus, setFocus] = useState<Set<string>>(() => new Set(DEFAULT_FOCUS))
  const [layer, setLayer] = useState<(typeof LAYERS)[number]>(player?.position?.layer ?? 'surface')
  const [steps, setSteps] = useState(8)
  const [narration, setNarration] = useState<string | null>(null)
  const [narrating, setNarrating] = useState(false)
  const [narrError, setNarrError] = useState<string | null>(null)

  const groupName = (id: string, fallback: string) => {
    const key = `groups.${id}`
    const tr = t(key)
    return tr === key ? fallback : tr
  }

  const origin = useMemo(() => {
    if (player?.position && player.position.layer === layer) return { x: player.position.x, z: player.position.z }
    return { x: 0, z: 0 } // centro de Hyrule (Lookout Landing fica ao lado)
  }, [player, layer])

  async function plan() {
    setNarration(null)
    setNarrError(null)
    const r = planRoute(data, manual, fromSave, { categories: focus, layer, maxSteps: steps, origin })
    setRoute(r.length ? r : null)
    if (r.length && geminiKey) {
      setNarrating(true)
      try {
        setNarration(await purahNarration(geminiKey, lang, progressBrief(data, manual, fromSave), r))
      } catch (e) {
        setNarrError(String(e))
      } finally {
        setNarrating(false)
      }
    }
  }

  function toggleFocus(id: string) {
    setFocus((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Purah */}
      <section className="flex items-center gap-3">
        <svg width="52" height="52" viewBox="0 0 100 100" fill="none" stroke="var(--color-jade)" strokeWidth="3" aria-hidden>
          <circle cx="50" cy="50" r="40" strokeDasharray="5 7" strokeLinecap="round" />
          <circle cx="50" cy="50" r="24" />
          <circle cx="50" cy="50" r="7" fill="var(--color-jade)" stroke="none" style={{ filter: 'drop-shadow(0 0 6px var(--color-jade))' }} />
        </svg>
        <div>
          <h2 className="font-display text-lg leading-tight">Purah</h2>
          <p className="text-xs text-ink-mute">{t('companion.tagline')}</p>
        </div>
      </section>

      {/* config da expedição */}
      <section className="panel space-y-3 p-4">
        <p className="text-xs uppercase tracking-widest text-ink-mute">{t('companion.focus')}</p>
        <div className="flex flex-wrap gap-1.5">
          {data.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => toggleFocus(c.id)}
              className="px-2 py-1 text-[11px]"
              style={{
                background: focus.has(c.id) ? 'var(--color-jade)' : 'transparent',
                color: focus.has(c.id) ? 'var(--color-abyss)' : 'var(--color-ink-mute)',
                border: '1px solid var(--color-edge)',
              }}
            >
              {groupName(c.id, c.label)}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-ink-mute">
            {t('companion.layer')}
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value as (typeof LAYERS)[number])}
              className="panel bg-stone px-2 py-1.5 text-sm text-ink"
            >
              {LAYERS.map((l) => (
                <option key={l} value={l}>{t(`map.layers.${l}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-ink-mute">
            {t('companion.steps')}
            <input
              type="number"
              min={3}
              max={20}
              value={steps}
              onChange={(e) => setSteps(Math.max(3, Math.min(20, Number(e.target.value))))}
              className="panel w-16 bg-stone px-2 py-1.5 font-mono text-sm text-ink"
            />
          </label>
          <button onClick={plan} className="btn-jade ml-auto">
            {t('companion.plan')}
          </button>
        </div>
        <p className="text-[11px] text-ink-faint">
          {player?.position
            ? t('companion.originSave', { x: Math.round(player.position.x), z: Math.round(player.position.z), layer: player.position.layer })
            : t('companion.originCenter')}
        </p>
      </section>

      {/* narrativa da Purah (BYOK) */}
      {(narrating || narration || narrError) && (
        <section className="panel space-y-2 p-4">
          {narrating && <p className="text-sm text-ink-mute">{t('companion.thinking')}</p>}
          {narration && <p className="whitespace-pre-wrap text-sm leading-relaxed">{narration}</p>}
          {narrError && <p className="text-xs" style={{ color: 'var(--color-gloom)' }}>{narrError}</p>}
        </section>
      )}

      {/* rota */}
      {route && route.length > 0 && (
        <section className="panel space-y-1 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('companion.route')}</h3>
            <button onClick={() => navigate('/map')} className="btn-jade !px-3 !py-1.5 !text-xs">
              {t('companion.showOnMap')}
            </button>
          </div>
          <ol className="space-y-1.5">
            {route.map((s, i) => (
              <li key={s.itemId} className="flex items-center gap-3 text-sm">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs"
                  style={{ background: 'var(--color-jade)', color: 'var(--color-abyss)' }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-faint">{groupName(s.groupId, s.groupId)}</span>
              </li>
            ))}
          </ol>
          <button onClick={() => setRoute(null)} className="pt-2 text-xs text-ink-faint underline-offset-2 hover:underline">
            {t('companion.clearRoute')}
          </button>
        </section>
      )}

      {/* BYOK */}
      <details className="panel px-4 py-3">
        <summary className="cursor-pointer list-none text-xs uppercase tracking-widest text-ink-mute">
          ⚙ {t('companion.byok')}
        </summary>
        <p className="mt-2 text-xs text-ink-faint">{t('companion.byokHint')}</p>
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza…"
          className="panel mt-2 w-full bg-stone px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </details>
    </div>
  )
}
