import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { planRoute, progressBrief } from '../lib/planner'
import { purahChatText } from '../lib/purah'
import { activeAiConfig, HOSTED_AI_AVAILABLE } from '../lib/ai'
import { parseIntentLocal, parseIntentLLM, type Intent } from '../lib/intent'
import { allArmorLabels, buildArmorPlan, type ArmorPlan } from '../lib/armorPlanner'
import { buildRegionPlan, type RegionPlan } from '../lib/regionPlanner'
import { REGIONS, regionById } from '../lib/regions'
import { categoryMeta } from '../lib/categoryMeta'
import { computeProgress } from '../lib/useDataset'
import { PlanFlow, type FlowStepDef } from '../components/PlanFlow'
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
interface SummaryPlan {
  type: 'summary'
  rows: { id: string; name: string; done: number; total: number }[]
}
interface RegionPlanMsg {
  type: 'region'
  plan: RegionPlan
}
type Plan = CollectPlan | ArmorPlanMsg | SummaryPlan | RegionPlanMsg

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
  const aiNarration = useAppStore((s) => s.aiNarration)
  const lang = useAppStore((s) => s.lang)
  const aiProvider = useAppStore((s) => s.aiProvider)
  const geminiKey = useAppStore((s) => s.geminiKey)
  const aiModel = useAppStore((s) => s.aiModel)
  const oaiBaseUrl = useAppStore((s) => s.oaiBaseUrl)
  const oaiModel = useAppStore((s) => s.oaiModel)
  const oaiKey = useAppStore((s) => s.oaiKey)

  const cfg = useMemo(
    () => activeAiConfig({ aiProvider, geminiKey, aiModel, oaiBaseUrl, oaiModel, oaiKey }),
    [aiProvider, geminiKey, aiModel, oaiBaseUrl, oaiModel, oaiKey],
  )

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

  // sugestões guiadas dinâmicas: coletas incompletas, armadura, região, resumo
  const suggestions = useMemo(() => {
    const groups = computeProgress(data, manual, fromSave)
    const out: string[] = []
    const incompleteCats = groups
      .filter((g) => g.isMarkerCategory && g.done < g.total)
      .sort((a, b) => a.done / a.total - b.done / b.total)
    for (const g of incompleteCats.slice(0, 2)) out.push(t('companion.suggestCollect', { name: groupName(g.id) }))
    const upg = data.stats.find((s) => s.id === 'armor_upgraded')
    const notMax = upg?.items.find((i) => !(manual['armor_upgraded']?.[i.id] || fromSave['armor_upgraded']?.[i.id]))
    if (notMax) out.push(t('companion.suggestArmor', { name: notMax.label ?? notMax.id }))
    // região com mais pendências
    let bestRegion = REGIONS[0]
    let bestCount = -1
    for (const region of REGIONS) {
      let count = 0
      for (const cat of data.categories) {
        const m = manual[cat.id] ?? {}
        const s = fromSave[cat.id] ?? {}
        for (const item of cat.items) {
          if (m[item.id] || s[item.id]) continue
          if (item.x >= region.box.x1 && item.x <= region.box.x2 && item.z >= region.box.z1 && item.z <= region.box.z2) count++
        }
      }
      if (count > bestCount) {
        bestCount = count
        bestRegion = region
      }
    }
    out.push(t('companion.suggestRegion', { name: bestRegion.name }))
    out.push(t('companion.suggestSummary'))
    if (out.length < 6 && armorLabels[0]) out.push(t('companion.suggestArmor', { name: armorLabels[0] }))
    return [...new Set(out)].slice(0, 6)
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

  function buildSummaryPlan(): SummaryPlan {
    const groups = computeProgress(data, manual, fromSave)
    const rows = groups
      .filter((g) => g.done < g.total)
      .sort((a, b) => a.done / a.total - b.done / b.total)
      .slice(0, 8)
      .map((g) => ({ id: g.id, name: groupName(g.id), done: g.done, total: g.total }))
    return { type: 'summary', rows }
  }

  async function handleAsk(text: string) {
    if (!text.trim() || busy) return
    setBusy(true)
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))

    let intent: Intent = parseIntentLocal(text, armorLabels)
    if (intent.kind === 'unknown' && cfg) {
      try {
        intent = await parseIntentLLM(cfg, text, data.categories.map((c) => c.id), armorLabels, REGIONS.map((r) => r.id))
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
          : t('companion.armorFlowReply', { name: p.label })
        narrationContext = `Armor plan for ${p.label}: owned=${p.owned}, stars=${p.currentStars}, totals=${p.totals.map((c) => `${c.qty}x ${c.material}${c.owned !== null ? ` (have ${c.owned})` : ''}`).join('; ')}`
      }
    } else if (intent.kind === 'region') {
      const region = regionById(intent.regionId)
      if (region) {
        const pos = player?.position ? { x: player.position.x, z: player.position.z } : null
        const p = buildRegionPlan(data, manual, fromSave, region, pos)
        plan = { type: 'region', plan: p }
        reply =
          p.totalPending === 0
            ? t('companion.regionDone', { name: region.name })
            : t('companion.regionReply', { name: region.name, count: p.totalPending, steps: p.steps.length })
        narrationContext = `Region sweep of ${region.name}: ${p.totalPending} pending across ${p.steps.length} steps: ${p.steps.map((s) => `${s.categoryId} (${s.pendingTotal})`).join(', ')}`
      }
    } else if (intent.kind === 'summary') {
      const p = buildSummaryPlan()
      plan = p
      reply = p.rows.length === 0 ? t('companion.summaryPerfect') : t('companion.summaryReply', { count: p.rows.length })
      narrationContext = `Summary of what's left: ${p.rows.map((r) => `${r.name} ${r.done}/${r.total}`).join('; ')}`
    }

    if (!plan) reply = t('companion.unknown')

    setMessages((prev) => [...prev, { role: 'purah', text: reply, plan: plan ?? undefined }])
    setBusy(false)
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))

    if (plan && cfg && aiNarration && narrationContext) {
      try {
        const narration = await purahChatText(cfg, lang, `${narrationContext}\nOverall progress: ${progressBrief(data, manual, fromSave).slice(0, 800)}`)
        setMessages((prev) => [...prev, { role: 'purah', text: narration }])
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
      } catch {
        /* narração é opcional */
      }
    }
  }

  const empty = messages.length === 0

  return (
    <div className="mx-auto flex h-[calc(100dvh-190px)] max-w-4xl flex-col lg:h-[calc(100dvh-110px)]">
      {/* topo: identidade + config IA */}
      <div className="mb-2 flex items-center justify-between">
        {!empty ? (
          <div className="flex items-center gap-2.5">
            <PurahFace size={34} />
            <span className="font-display">Purah</span>
          </div>
        ) : (
          <span />
        )}
        <AiSettings aiReady={!!cfg} />
      </div>

      {/* área central */}
      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden text-center sm:gap-4">
          <img
            src="/purah.png"
            alt="Purah"
            className="h-32 min-h-0 shrink object-contain sm:h-64"
            style={{ filter: 'drop-shadow(0 0 24px rgba(87,230,192,.35))' }}
          />
          <h2 className="font-display text-xl sm:text-3xl">{t('companion.heroTitle')}</h2>
          <p className="max-w-md text-xs text-ink-mute sm:text-sm">{t('companion.heroSub')}</p>
        </div>
      ) : (
        <div className="panel flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-stone-2 px-3.5 py-2 text-sm" style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-start gap-2.5">
                <PurahFace size={30} />
                <div className="min-w-0 max-w-[90%] flex-1 space-y-2">
                  {m.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>}
                  {m.plan?.type === 'collect' && <CollectPlanCard plan={m.plan} groupName={groupName} />}
                  {m.plan?.type === 'armor' && <ArmorPlanCard plan={m.plan.plan} groupName={groupName} />}
                  {m.plan?.type === 'summary' && <SummaryCard plan={m.plan} />}
                  {m.plan?.type === 'region' && <RegionPlanCard plan={m.plan.plan} groupName={groupName} />}
                </div>
              </div>
            ),
          )}
          {busy && <p className="text-xs text-ink-faint">{t('companion.thinking')}</p>}
          <div ref={endRef} />
        </div>
      )}

      {/* sugestões + input */}
      <div className="mt-4 space-y-2.5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-ink-faint">{t('companion.suggestionsLabel')}</p>
        <div className={`gap-2 ${empty ? 'grid grid-cols-1 sm:grid-cols-3' : 'flex flex-wrap'}`}>
          {(empty ? suggestions : suggestions.slice(0, 3)).map((s, i) => (
            <button
              key={s}
              onClick={() => handleAsk(s)}
              className={`panel text-left text-ink-mute transition-all hover:border-edge-lit hover:text-ink ${
                empty ? `px-3.5 py-3 text-sm ${i >= 3 ? 'hidden sm:block' : ''}` : 'px-2.5 py-1.5 text-[11px]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="panel flex items-center gap-2 pr-2"
          onSubmit={(e) => {
            e.preventDefault()
            handleAsk(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('companion.placeholder')}
            className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label={t('companion.send')}
            className="flex h-9 w-9 items-center justify-center transition-transform active:scale-90 disabled:opacity-30"
            style={{ background: 'var(--color-jade)', color: 'var(--color-abyss)', clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)', boxShadow: 'var(--glow-jade)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h16M13 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

function AiSettings({ aiReady }: { aiReady: boolean }) {
  const { t } = useTranslation()
  const aiProvider = useAppStore((s) => s.aiProvider)
  const setAiProvider = useAppStore((s) => s.setAiProvider)
  const geminiKey = useAppStore((s) => s.geminiKey)
  const setGeminiKey = useAppStore((s) => s.setGeminiKey)
  const aiModel = useAppStore((s) => s.aiModel)
  const setAiModel = useAppStore((s) => s.setAiModel)
  const oaiBaseUrl = useAppStore((s) => s.oaiBaseUrl)
  const setOaiBaseUrl = useAppStore((s) => s.setOaiBaseUrl)
  const oaiModel = useAppStore((s) => s.oaiModel)
  const setOaiModel = useAppStore((s) => s.setOaiModel)
  const oaiKey = useAppStore((s) => s.oaiKey)
  const setOaiKey = useAppStore((s) => s.setOaiKey)
  const aiNarration = useAppStore((s) => s.aiNarration)
  const setAiNarration = useAppStore((s) => s.setAiNarration)

  const fieldCls = 'panel mt-1 w-full bg-stone-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:outline-none'

  return (
    <details className="relative">
      <summary className="panel flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-mute hover:text-jade">
        ⚙ {t('companion.byokShort')}
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: aiReady ? 'var(--color-jade)' : 'var(--color-gloom)', boxShadow: aiReady ? 'var(--glow-jade)' : undefined }} />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-85 space-y-3 border border-edge bg-stone p-4">
        <p className="text-[11px] leading-relaxed text-ink-faint">{t('companion.byokHint')}</p>

        <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
          {t('companion.provider')}
          <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as 'hosted' | 'gemini' | 'openai')} className="panel mt-1 w-full bg-stone-2 px-2 py-2 text-sm text-ink">
            {HOSTED_AI_AVAILABLE && <option value="hosted">{t('companion.providerHosted')}</option>}
            <option value="gemini">Google Gemini (BYOK)</option>
            <option value="openai">OpenAI-compatible (OpenRouter / Groq / Ollama…)</option>
          </select>
        </label>

        {aiProvider === 'hosted' ? (
          <p className="text-[10px] leading-relaxed" style={{ color: 'var(--color-jade)' }}>✓ {t('companion.hostedNote')}</p>
        ) : aiProvider === 'gemini' ? (
          <>
            <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
              {t('companion.apiKey')}
              <input type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza…" className={fieldCls} />
            </label>
            {!geminiKey && HOSTED_AI_AVAILABLE && <p className="text-[10px]" style={{ color: 'var(--color-jade)' }}>✓ {t('companion.hostedFallbackNote')}</p>}
            <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
              {t('companion.model')}
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="panel mt-1 w-full bg-stone-2 px-2 py-2 text-sm text-ink">
                <option value="gemini-flash-latest">Gemini Flash ({t('companion.modelFast')})</option>
                <option value="gemini-pro-latest">Gemini Pro ({t('companion.modelSmart')})</option>
                <option value="gemini-flash-lite-latest">Gemini Flash-Lite ({t('companion.modelLite')})</option>
                <option value="gemini-3-flash-preview">Gemini 3 Flash (preview)</option>
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
              Base URL
              <input value={oaiBaseUrl} onChange={(e) => setOaiBaseUrl(e.target.value)} placeholder="https://openrouter.ai/api/v1" className={fieldCls} />
            </label>
            <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
              {t('companion.model')}
              <input value={oaiModel} onChange={(e) => setOaiModel(e.target.value)} placeholder="meta-llama/llama-3.3-70b-instruct:free" className={fieldCls} />
            </label>
            <label className="block text-[10px] uppercase tracking-widest text-ink-mute">
              {t('companion.apiKey')}
              <input type="password" value={oaiKey} onChange={(e) => setOaiKey(e.target.value)} placeholder="sk-…" className={fieldCls} />
            </label>
          </>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-mute">
          <input type="checkbox" checked={aiNarration} onChange={(e) => setAiNarration(e.target.checked)} className="h-3.5 w-3.5 accent-(--color-jade)" />
          {t('companion.narration')}
        </label>
      </div>
    </details>
  )
}

/** rosto da Purah (retrato do usuário); fallback = runa Zonai */
function PurahFace({ size }: { size: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="var(--color-jade)" strokeWidth="4" aria-hidden className="shrink-0">
        <circle cx="50" cy="50" r="40" strokeDasharray="5 7" strokeLinecap="round" />
        <circle cx="50" cy="50" r="7" fill="var(--color-jade)" stroke="none" />
      </svg>
    )
  }
  return (
    <span
      className="inline-block shrink-0 overflow-hidden rounded-full border border-edge-lit"
      style={{ width: size, height: size, boxShadow: 'var(--glow-jade)' }}
    >
      <img
        src="/purah.png"
        alt="Purah"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
        style={{ objectPosition: '50% 12%', transform: 'scale(1.6)', transformOrigin: '50% 18%' }}
      />
    </span>
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

function RegionPlanCard({ plan, groupName }: { plan: RegionPlan; groupName: (id: string) => string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)
  if (plan.totalPending === 0) return null

  const steps: FlowStepDef[] = plan.steps.map((s) => {
    const meta = categoryMeta(s.categoryId)
    return {
      color: meta.color,
      title: (
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {meta.icon ? <img src={meta.icon} alt="" className="h-4.5 w-4.5 object-contain" /> : <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
          <span className="min-w-0 truncate">{groupName(s.categoryId)}</span>
          <span className="ml-auto shrink-0 font-mono text-xs" style={{ color: meta.color }}>
            {s.pendingTotal}
          </span>
        </span>
      ),
      children: (
        <div className="space-y-0.5">
          {s.items.slice(0, 4).map((it) => (
            <p key={it.itemId} className="truncate font-mono text-[10px] text-ink-faint">
              {it.label.startsWith('(') ? it.label : `${it.label} · (${Math.round(it.x)}, ${Math.round(it.z)})${it.layer !== 'surface' ? ` · ${it.layer}` : ''}`}
            </p>
          ))}
          {s.pendingTotal > 4 && <p className="font-mono text-[10px] text-ink-faint">+{s.pendingTotal - 4}…</p>}
        </div>
      ),
    }
  })

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{plan.regionName}</span>
        <span className="font-mono text-xs" style={{ color: 'var(--color-jade)' }}>
          {plan.totalPending} {t('companion.pending')}
        </span>
      </div>
      <PlanFlow steps={steps} />
      <div className="flex items-center gap-3 border-t border-edge/60 pt-2">
        <button
          onClick={() => {
            setRoute(plan.route)
            navigate('/map')
          }}
          className="btn-jade !px-3 !py-1.5 !text-xs"
        >
          {t('companion.showOnMap')}
        </button>
        <span className="font-mono text-[10px] text-ink-faint">{t('companion.routePoints', { count: plan.route.length })}</span>
      </div>
    </div>
  )
}

function SummaryCard({ plan }: { plan: SummaryPlan }) {
  return (
    <div className="panel space-y-2 p-3">
      {plan.rows.map((r) => {
        const meta = categoryMeta(r.id)
        const frac = r.total ? r.done / r.total : 0
        return (
          <div key={r.id} className="flex items-center gap-2.5 text-xs">
            {meta.icon ? <img src={meta.icon} alt="" className="h-4 w-4 object-contain" /> : <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
            <span className="w-40 min-w-0 truncate text-ink-mute">{r.name}</span>
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-2">
              <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: meta.color }} />
            </div>
            <span className="shrink-0 font-mono text-[11px]" style={{ color: meta.color }}>
              {r.done}
              <span className="text-ink-faint">/{r.total}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ArmorPlanCard({ plan, groupName }: { plan: ArmorPlan; groupName: (id: string) => string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)
  const player = useAppStore((s) => s.player)
  const data = useDataset()

  // rota de execução: baú (se falta a peça) + chefes que dropam materiais faltantes
  const armorRoute = useMemo(() => {
    const route: RouteStep[] = []
    let cursor = player?.position ? { x: player.position.x, z: player.position.z } : { x: 0, z: 0 }
    if (!plan.owned && plan.chest) {
      route.push({ groupId: 'armor', itemId: plan.chest.itemId, label: plan.label, x: plan.chest.x, z: plan.chest.z, layer: plan.chest.layer })
      cursor = { x: plan.chest.x, z: plan.chest.z }
    }
    for (const target of plan.farmTargets) {
      const cat = data.categories.find((c) => c.id === target.categoryId)
      if (!cat) continue
      const pool = cat.items.map((i) => ({
        groupId: cat.id,
        itemId: i.id,
        label: `${groupName(cat.id)} — ${target.materials.join(', ')}`,
        x: i.x,
        z: i.z,
        layer: i.layer ?? 'surface',
      }))
      let picked = 0
      while (picked < 4 && pool.length > 0 && route.length < 16) {
        let bestIdx = 0
        let bestDist = Infinity
        for (let i = 0; i < pool.length; i++) {
          const d = (pool[i].x - cursor.x) ** 2 + (pool[i].z - cursor.z) ** 2
          if (d < bestDist) {
            bestDist = d
            bestIdx = i
          }
        }
        const next = pool.splice(bestIdx, 1)[0]
        route.push(next)
        cursor = next
        picked++
      }
    }
    return route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, player, data])

  const steps: FlowStepDef[] = []
  if (!plan.owned) {
    steps.push({
      color: 'var(--color-gold)',
      title: <span>{t('companion.stepGetPiece')}</span>,
      children: plan.chest ? (
        <p className="text-xs text-ink-mute">{t('companion.chestAt', { x: Math.round(plan.chest.x), z: Math.round(plan.chest.z), layer: plan.chest.layer })}</p>
      ) : (
        <p className="text-xs text-ink-faint">{t('companion.noChest')}</p>
      ),
    })
  }
  for (const lvl of plan.levels) {
    steps.push({
      title: (
        <span>
          {t('companion.stepUpgrade', { stars: lvl.level })} <span className="text-ink-faint">{'★'.repeat(lvl.level)}{'☆'.repeat(4 - lvl.level)}</span>
        </span>
      ),
      children: (
        <div className="grid gap-1 sm:grid-cols-2">
          {lvl.costs.map((c) => (
            <MaterialRow key={c.material} cost={c} />
          ))}
        </div>
      ),
    })
  }
  if (plan.farmTargets.length > 0) {
    steps.push({
      color: 'var(--color-gloom)',
      title: <span>{t('companion.stepFarm')}</span>,
      children: (
        <div className="flex flex-wrap gap-1.5">
          {plan.farmTargets.map((f) => {
            const meta = categoryMeta(f.categoryId)
            return (
              <span key={f.categoryId} className="flex items-center gap-1.5 border border-edge/60 px-2 py-1 text-[11px] text-ink-mute">
                {meta.icon && <img src={meta.icon} alt="" className="h-3.5 w-3.5 object-contain" />}
                {groupName(f.categoryId)}: {f.materials.join(', ')}
              </span>
            )
          })}
        </div>
      ),
    })
  }

  return (
    <div className="panel space-y-3 p-3">
      <div className="flex items-center gap-2">
        <img src="/icons/treasure.png" alt="" className="h-5 w-5 object-contain" />
        <span className="text-sm font-medium">{plan.label}</span>
        <span className="ml-auto font-mono text-xs" style={{ color: plan.currentStars === 4 ? 'var(--color-gold)' : 'var(--color-jade)' }}>
          {plan.owned ? `${'★'.repeat(plan.currentStars ?? 0)}${'☆'.repeat(4 - (plan.currentStars ?? 0))}` : t('companion.notOwned')}
        </span>
      </div>

      {!plan.upgradable && plan.owned && <p className="text-xs text-ink-faint">{t('companion.notUpgradable')}</p>}
      {plan.currentStars === null && plan.owned && <p className="text-xs text-ink-faint">{t('companion.starsUnknown')}</p>}

      {steps.length > 0 && <PlanFlow steps={steps} />}

      {plan.totals.length > 0 && (
        <div className="border-t border-edge/60 pt-2">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-ink-faint">{t('companion.totals')}</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {plan.totals.map((c) => (
              <MaterialRow key={c.material} cost={c} />
            ))}
          </div>
          {plan.totals.every((c) => c.owned === null) && <p className="mt-1.5 text-[10px] text-ink-faint">{t('companion.noStockHint')}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-edge/60 pt-2">
        {armorRoute.length > 0 && (
          <button
            onClick={() => {
              setRoute(armorRoute)
              navigate('/map')
            }}
            className="btn-jade !px-3 !py-1.5 !text-xs"
          >
            {t('companion.showOnMap')}
          </button>
        )}
        {plan.levels.length > 0 && <p className="text-[10px] text-ink-faint">{t('companion.fairyNote')}</p>}
      </div>
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
