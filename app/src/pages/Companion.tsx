import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { planRoute, progressBrief } from '../lib/planner'
import { purahChatText } from '../lib/purah'
import { parseIntentLocal, parseIntentLLM, type Intent } from '../lib/intent'
import { allArmorLabels, buildArmorPlan, type ArmorPlan } from '../lib/armorPlanner'
import { categoryMeta } from '../lib/categoryMeta'
import { useAppStore, type RouteStep } from '../store/appStore'

interface CollectPlan {
  type: 'collect'
  categoryId: string
  pendingTotal: number
  layer: string
  steps: RouteStep[]
}
interface ArmorPlanMsg {
  type: 'armor'
  plan: ArmorPlan
}
type Plan = CollectPlan | ArmorPlanMsg

interface Msg {
  role: 'user' | 'purah'
  text?: string
  plan?: Plan
}

export function Companion() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const player = useAppStore((s) => s.player)
  const geminiKey = useAppStore((s) => s.geminiKey)
  const setGeminiKey = useAppStore((s) => s.setGeminiKey)
  const lang = useAppStore((s) => s.lang)

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const armorLabels = useMemo(() => allArmorLabels(data), [data])

  const groupName = (id: string) => {
    const key = `groups.${id}`
    const tr = t(key)
    if (tr !== key) return tr
    return (data.categories.find((c) => c.id === id) ?? data.stats.find((s) => s.id === id))?.label ?? id
  }

  const suggestions = useMemo(() => {
    const out: string[] = []
    for (const id of ['koroks', 'shrines', 'bubbulfrogs', 'old_map']) {
      const cat = data.categories.find((c) => c.id === id)
      if (!cat) continue
      const done = cat.items.filter((i) => manual[id]?.[i.id] || fromSave[id]?.[i.id]).length
      if (done < cat.items.length) out.push(t('companion.suggestCollect', { name: groupName(id) }))
      if (out.length >= 2) break
    }
    const upg = data.stats.find((s) => s.id === 'armor_upgraded')
    const notMax = upg?.items.find((i) => !(manual['armor_upgraded']?.[i.id] || fromSave['armor_upgraded']?.[i.id]))
    if (notMax) out.push(t('companion.suggestArmor', { name: notMax.label ?? notMax.id }))
    if (out.length === 0) out.push(t('companion.suggestArmor', { name: armorLabels[0] ?? 'Hylian Hood' }))
    return out.slice(0, 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, manual, fromSave, t])

  function buildCollectPlan(categoryId: string): CollectPlan | null {
    const cat = data.categories.find((c) => c.id === categoryId)
    if (!cat) return null
    const m = manual[categoryId] ?? {}
    const s = fromSave[categoryId] ?? {}
    const pendingByLayer = new Map<string, number>()
    let pendingTotal = 0
    for (const item of cat.items) {
      if (m[item.id] || s[item.id]) continue
      pendingTotal++
      const l = item.layer ?? 'surface'
      pendingByLayer.set(l, (pendingByLayer.get(l) ?? 0) + 1)
    }
    if (pendingTotal === 0) return { type: 'collect', categoryId, pendingTotal: 0, layer: 'surface', steps: [] }
    const layer = [...pendingByLayer.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const origin =
      player?.position && player.position.layer === layer
        ? { x: player.position.x, z: player.position.z }
        : { x: 0, z: 0 }
    const steps = planRoute(data, manual, fromSave, { categories: new Set([categoryId]), layer, maxSteps: 10, origin })
    return { type: 'collect', categoryId, pendingTotal, layer, steps }
  }

  async function handleAsk(text: string) {
    if (!text.trim() || busy) return
    setBusy(true)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text }])

    let intent: Intent = parseIntentLocal(text, armorLabels)
    if (intent.kind === 'unknown' && geminiKey) {
      try {
        intent = await parseIntentLLM(geminiKey, text, data.categories.map((c) => c.id), armorLabels)
      } catch {
        /* fica unknown */
      }
    }

    let plan: Plan | null = null
    let reply = ''
    let narrationContext = ''

    if (intent.kind === 'collect') {
      const p = buildCollectPlan(intent.categoryId)
      if (p) {
        plan = p
        reply =
          p.pendingTotal === 0
            ? t('companion.allDone', { name: groupName(p.categoryId) })
            : t('companion.collectReply', { count: p.pendingTotal, name: groupName(p.categoryId), layer: t(`map.layers.${p.layer}`) })
        narrationContext = `Collect plan: ${p.pendingTotal} ${p.categoryId} pending. First stops: ${p.steps.map((st, i) => `${i + 1}. ${st.label} (${Math.round(st.x)},${Math.round(st.z)})`).join('; ')}`
      }
    } else if (intent.kind === 'armor') {
      const p = buildArmorPlan(data, manual, fromSave, intent.label)
      if (p) {
        plan = { type: 'armor', plan: p }
        reply = p.owned
          ? p.currentStars === 4
            ? t('companion.armorMaxed', { name: p.label })
            : t('companion.armorReply', { name: p.label, stars: p.currentStars ?? '?' })
          : t('companion.armorNotOwned', { name: p.label })
        narrationContext = `Armor plan for ${p.label}: owned=${p.owned}, stars=${p.currentStars}, levels remaining=${p.levels.map((l) => l.level).join(',')}, totals=${p.totals.map((c) => `${c.qty}x ${c.material}${c.owned !== null ? ` (have ${c.owned})` : ''}`).join('; ')}`
      }
    }

    if (!plan) reply = t('companion.unknown')

    setMessages((prev) => [...prev, { role: 'purah', text: reply, plan: plan ?? undefined }])
    setBusy(false)
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))

    if (plan && geminiKey && narrationContext) {
      try {
        const narration = await purahChatText(geminiKey, lang, `${narrationContext}\nOverall progress: ${progressBrief(data, manual, fromSave).slice(0, 800)}`)
        setMessages((prev) => [...prev, { role: 'purah', text: narration }])
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
      } catch {
        /* narração é opcional */
      }
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-160px)] max-w-4xl flex-col lg:h-[calc(100dvh-120px)]">
      {/* header Purah */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PurahAvatar size={44} />
          <div>
            <h2 className="font-display text-lg leading-tight">Purah</h2>
            <p className="text-[11px] text-ink-mute">{t('companion.tagline')}</p>
          </div>
        </div>
        <details className="relative">
          <summary className="panel cursor-pointer list-none px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-mute hover:text-jade">
            ⚙ {t('companion.byokShort')}
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-72 border border-edge bg-stone p-3">
            <p className="text-[11px] text-ink-faint">{t('companion.byokHint')}</p>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="AIza…"
              className="panel mt-2 w-full bg-stone-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        </details>
      </div>

      {/* mensagens */}
      <div className="panel flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <PurahAvatar size={64} />
            <p className="max-w-sm text-sm text-ink-mute">{t('companion.hello')}</p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] bg-stone-2 px-3.5 py-2 text-sm" style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}>
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-start gap-2.5">
              <PurahAvatar size={26} />
              <div className="min-w-0 max-w-[90%] space-y-2">
                {m.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>}
                {m.plan?.type === 'collect' && <CollectPlanCard plan={m.plan} groupName={groupName} />}
                {m.plan?.type === 'armor' && <ArmorPlanCard plan={m.plan.plan} />}
              </div>
            </div>
          ),
        )}
        {busy && <p className="text-xs text-ink-faint">{t('companion.thinking')}</p>}
        <div ref={endRef} />
      </div>

      {/* sugestões + input */}
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleAsk(s)}
              className="border border-edge px-2.5 py-1 text-[11px] text-ink-mute transition-colors hover:border-edge-lit hover:text-jade"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleAsk(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('companion.placeholder')}
            className="panel min-w-0 flex-1 bg-stone px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button type="submit" disabled={busy || !input.trim()} className="btn-jade disabled:opacity-40">
            {t('companion.send')}
          </button>
        </form>
      </div>
    </div>
  )
}

function CollectPlanCard({ plan, groupName }: { plan: CollectPlan; groupName: (id: string) => string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)
  const meta = categoryMeta(plan.categoryId)
  if (plan.pendingTotal === 0) return null
  return (
    <div className="panel space-y-2 p-3">
      <div className="flex items-center gap-2">
        {meta.icon ? <img src={meta.icon} alt="" className="h-5 w-5 object-contain" /> : <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />}
        <span className="text-sm font-medium">{groupName(plan.categoryId)}</span>
        <span className="ml-auto font-mono text-xs" style={{ color: meta.color }}>
          {plan.pendingTotal} {t('companion.pending')}
        </span>
      </div>
      <ol className="space-y-1">
        {plan.steps.map((s, i) => (
          <li key={s.itemId} className="flex items-center gap-2.5 text-xs">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]" style={{ background: meta.color, color: 'var(--color-abyss)' }}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-mute">{s.label}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-faint">({Math.round(s.x)}, {Math.round(s.z)})</span>
          </li>
        ))}
      </ol>
      <button
        onClick={() => {
          setRoute(plan.steps)
          navigate('/map')
        }}
        className="btn-jade !px-3 !py-1.5 !text-xs"
      >
        {t('companion.showOnMap')}
      </button>
    </div>
  )
}

function ArmorPlanCard({ plan }: { plan: ArmorPlan }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center gap-2">
        <img src="/icons/treasure.png" alt="" className="h-5 w-5 object-contain" />
        <span className="text-sm font-medium">{plan.label}</span>
        <span className="ml-auto font-mono text-xs" style={{ color: plan.currentStars === 4 ? 'var(--color-gold)' : 'var(--color-jade)' }}>
          {plan.owned ? `${'★'.repeat(plan.currentStars ?? 0)}${'☆'.repeat(4 - (plan.currentStars ?? 0))}` : t('companion.notOwned')}
        </span>
      </div>

      {!plan.owned && plan.chest && (
        <div className="flex items-center justify-between gap-2 border border-edge/60 px-2.5 py-2 text-xs">
          <span className="text-ink-mute">
            {t('companion.chestAt', { x: Math.round(plan.chest.x), z: Math.round(plan.chest.z), layer: plan.chest.layer })}
          </span>
          <button
            onClick={() => {
              setRoute([{ groupId: 'armor', itemId: plan.chest!.itemId, label: plan.label, x: plan.chest!.x, z: plan.chest!.z, layer: plan.chest!.layer }])
              navigate('/map')
            }}
            className="shrink-0 border border-edge px-2 py-1 text-[10px] uppercase text-ink-mute hover:text-jade"
          >
            {t('companion.showOnMap')}
          </button>
        </div>
      )}

      {!plan.upgradable && plan.owned && <p className="text-xs text-ink-faint">{t('companion.notUpgradable')}</p>}
      {plan.currentStars === null && plan.owned && <p className="text-xs text-ink-faint">{t('companion.starsUnknown')}</p>}

      {plan.levels.map((lvl) => (
        <div key={lvl.level}>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-ink-faint">
            {'★'.repeat(lvl.level)}
            {'☆'.repeat(4 - lvl.level)}
          </p>
          <div className="grid gap-1 sm:grid-cols-2">
            {lvl.costs.map((c) => (
              <MaterialRow key={c.material} cost={c} />
            ))}
          </div>
        </div>
      ))}

      {plan.totals.length > 0 && (
        <div className="border-t border-edge/60 pt-2">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-ink-faint">{t('companion.totals')}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {plan.totals.map((c) => (
              <MaterialRow key={c.material} cost={c} />
            ))}
          </div>
        </div>
      )}
      {plan.levels.length > 0 && <p className="text-[10px] text-ink-faint">{t('companion.fairyNote')}</p>}
    </div>
  )
}

function MaterialRow({ cost }: { cost: { material: string; qty: number; owned: number | null } }) {
  const enough = cost.owned !== null && cost.owned >= cost.qty
  return (
    <div className="flex items-center gap-2 border border-edge/40 px-2 py-1.5 text-xs">
      <img src="/icons/leaf.png" alt="" className="h-4 w-4 object-contain opacity-70" />
      <span className="min-w-0 flex-1 truncate text-ink-mute">{cost.material}</span>
      <span className="shrink-0 font-mono text-[11px]">
        <span style={{ color: cost.owned === null ? 'var(--color-ink)' : enough ? 'var(--color-jade)' : 'var(--color-gloom)' }}>
          {cost.owned !== null ? cost.owned : '—'}
        </span>
        <span className="text-ink-faint">/{cost.qty}</span>
      </span>
    </div>
  )
}

function PurahAvatar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="var(--color-jade)" strokeWidth="3" aria-hidden className="shrink-0">
      <circle cx="50" cy="50" r="40" strokeDasharray="5 7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="24" />
      <circle cx="50" cy="50" r="7" fill="var(--color-jade)" stroke="none" style={{ filter: 'drop-shadow(0 0 6px var(--color-jade))' }} />
    </svg>
  )
}
