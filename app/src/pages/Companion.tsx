import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { planRoute, progressBrief } from '../lib/planner'
import { purahChatText } from '../lib/purah'
import { activeAiConfig, HOSTED_AI_AVAILABLE } from '../lib/ai'
import { parseIntentLocal, parseIntentLLM, CHECKLIST_STAT_IDS, type Intent } from '../lib/intent'
import { allArmorLabels, buildArmorPlan, type ArmorPlan } from '../lib/armorPlanner'
import { buildRegionPlan, type RegionPlan } from '../lib/regionPlanner'
import { REGIONS, regionById } from '../lib/regions'
import { categoryMeta } from '../lib/categoryMeta'
import { itemLabel } from '../lib/itemLabel'
import { buildReportHtml } from '../lib/reportHtml'
import { encodeReportState } from '../lib/reportState'
import { computeProgress } from '../lib/useDataset'
import { PlanFlow, type FlowStepDef } from '../components/PlanFlow'
import { RouteArtifact } from '../components/RouteArtifact'
import { optimizeRoute, type OptimizedRoute } from '../lib/routePlanner'
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
/**
 * Grupos sem coordenada (tecidos, quests, receitas…): não há rota a traçar,
 * então a resposta honesta é a lista do que falta + de onde vem cada um.
 */
interface ChecklistPlan {
  type: 'checklist'
  statId: string
  pending: { label: string; hint?: string }[]
  pendingTotal: number
  total: number
}
/**
 * Pedido que junta vários grupos ("poços, placas do Addison e localidades").
 * Antes só o primeiro grupo citado era atendido — os outros sumiam calados.
 * Guarda tudo junto pra virar uma rota única no mapa e um relatório baixável.
 */
interface ReportPlan {
  type: 'report'
  collects: CollectPlan[]
  checklists: ChecklistPlan[]
  routeCategoryIds: string[]
  layer: string
  steps: RouteStep[]
  pendingTotal: number
  /** tudo que falta nas categorias com mapa, por grupo — a rota é só uma
   *  viagem (~24 paradas), mas o relatório tem que listar o resto também */
  mapPending: { categoryId: string; items: { label: string; x: number; z: number; layer: string }[] }[]
}
type Plan = CollectPlan | ArmorPlanMsg | SummaryPlan | RegionPlanMsg | ChecklistPlan | ReportPlan

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
  /** rota aberta no painel lateral (o "artefato") */
  const [artifact, setArtifact] = useState<{ route: OptimizedRoute; title: string } | null>(null)
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

  /**
   * O que ainda falta num grupo sem mapa. `hint` sai do próprio dataset:
   * tecidos trazem `source` (o jeito exato de obter), receitas trazem os
   * ingredientes. Onde não há metadado, fica só o nome — melhor admitir isso
   * do que inventar uma localização.
   */
  function buildChecklistPlan(statId: string): ChecklistPlan | null {
    const stat = data.stats.find((st) => st.id === statId)
    if (!stat) return null
    const m = manual[statId] ?? {}
    const sv = fromSave[statId] ?? {}
    const hintOf = (item: Record<string, unknown>): string | undefined => {
      const source = item.source as string | undefined
      if (source && source !== 'Default') return source
      const ingredients = item.recipeIngredients as string[] | undefined
      if (ingredients?.length) return ingredients.join(' + ')
      return undefined
    }
    const pending = stat.items
      .filter((item) => !m[item.id] && !sv[item.id])
      .map((item) => ({ label: item.label ?? item.id, hint: hintOf(item as unknown as Record<string, unknown>) }))
    // guarda a lista inteira: o cartao corta na hora de desenhar, mas o
    // relatorio baixado precisa de tudo — um report pela metade nao serve
    return { type: 'checklist', statId, pending, pendingTotal: pending.length, total: stat.items.length }
  }

  /**
   * Junta vários grupos num pedido só: traça UMA rota cobrindo todas as
   * categorias que têm coordenada (na camada com mais pendências) e anexa a
   * checklist dos grupos que não têm.
   */
  function buildReportPlan(categoryIds: string[], statIds: string[]): ReportPlan {
    const collects = categoryIds.map((id) => buildCollectPlan(id)).filter((p): p is CollectPlan => !!p)
    const checklists = statIds.map((id) => buildChecklistPlan(id)).filter((p): p is ChecklistPlan => !!p)

    // A camada é escolhida pela COBERTURA de grupos, não pelo volume bruto.
    // "poços, placas e localidades" somava mais pendências nas Depths (só
    // localidades existem lá), e a rota saía só com localidades — jogando fora
    // dois dos três grupos pedidos. Vence a camada onde mais grupos têm algo
    // pendente; volume só desempata.
    const byLayer = new Map<string, { count: number; groups: Set<string> }>()
    for (const id of categoryIds) {
      const cat = data.categories.find((c) => c.id === id)
      if (!cat) continue
      const m = manual[id] ?? {}
      const sv = fromSave[id] ?? {}
      for (const item of cat.items) {
        if (m[item.id] || sv[item.id]) continue
        const l = item.layer ?? 'surface'
        const entry = byLayer.get(l) ?? { count: 0, groups: new Set<string>() }
        entry.count++
        entry.groups.add(id)
        byLayer.set(l, entry)
      }
    }
    const layer =
      [...byLayer.entries()].sort((a, b) =>
        b[1].groups.size !== a[1].groups.size ? b[1].groups.size - a[1].groups.size : b[1].count - a[1].count,
      )[0]?.[0] ?? 'surface'
    const origin =
      player?.position && player.position.layer === layer ? { x: player.position.x, z: player.position.z } : null
    // maxStops padrão (24) é uma viagem; num relatório o que se quer é o
    // caminho por TUDO que falta, senão o mapa mostra 24 de 104 e parece que
    // o resto não existe
    const route = categoryIds.length
      ? optimizeRoute(data, manual, fromSave, {
          categories: new Set(categoryIds),
          layer,
          origin,
          maxStops: 500,
        })
      : { stops: [] as RouteStep[] }

    const mapPending = categoryIds.map((id) => {
      const cat = data.categories.find((c) => c.id === id)
      const m = manual[id] ?? {}
      const sv = fromSave[id] ?? {}
      return {
        categoryId: id,
        items: (cat?.items ?? [])
          .filter((it) => !m[it.id] && !sv[it.id])
          .map((it) => ({ label: itemLabel(it), x: it.x, z: it.z, layer: it.layer ?? 'surface' })),
      }
    })

    return {
      type: 'report',
      collects,
      checklists,
      routeCategoryIds: categoryIds,
      layer,
      steps: route.stops,
      mapPending,
      pendingTotal: collects.reduce((n, c) => n + c.pendingTotal, 0) + checklists.reduce((n, c) => n + c.pendingTotal, 0),
    }
  }

  /** abre o painel de rota à direita do chat */
  function traceRoute(
    categoryIds: string[],
    layer: string,
    title: string,
    bounds?: { x1: number; x2: number; z1: number; z2: number },
  ) {
    const route = optimizeRoute(data, manual, fromSave, {
      categories: new Set(categoryIds),
      layer,
      origin:
        player?.position && player.position.layer === layer
          ? { x: player.position.x, z: player.position.z }
          : null,
      bounds,
    })
    if (route.stops.length) setArtifact({ route, title })
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
        intent = await parseIntentLLM(cfg, text, data.categories.map((c) => c.id), armorLabels, REGIONS.map((r) => r.id), CHECKLIST_STAT_IDS)
      } catch {
        /* fica unknown */
      }
    }

    let plan: Plan | null = null
    let reply = ''
    let narrationContext = ''

    if (intent.kind === 'collect' && intent.categoryIds.length === 1) {
      const p = buildCollectPlan(intent.categoryIds[0])
      if (p) {
        plan = p
        reply =
          p.pendingTotal === 0
            ? t('companion.allDone', { name: groupName(p.categoryId) })
            : t('companion.collectReply', { count: p.pendingTotal, name: groupName(p.categoryId), layer: t(`map.layers.${p.layer}`) })
        narrationContext = `Collect plan: ${p.pendingTotal} ${p.categoryId} pending. First stops: ${p.steps.map((st, i) => `${i + 1}. ${st.label} (${Math.round(st.x)},${Math.round(st.z)})`).join('; ')}`
      }
    } else if (intent.kind === 'collect' || intent.kind === 'report') {
      const cids = intent.kind === 'report' ? intent.categoryIds : intent.categoryIds
      const sids = intent.kind === 'report' ? intent.statIds : []
      const p = buildReportPlan(cids, sids)
      plan = p
      const names = [...p.collects.map((c) => groupName(c.categoryId)), ...p.checklists.map((c) => groupName(c.statId))]
      reply =
        p.pendingTotal === 0
          ? t('companion.allDone', { name: names.join(', ') })
          : t('companion.reportReply', { count: p.pendingTotal, names: names.join(', '), stops: p.steps.length })
      narrationContext = `Combined report for ${names.join(', ')}: ${p.pendingTotal} pending; ${p.steps.length} mapped stops on ${p.layer}.`
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
    } else if (intent.kind === 'checklist' && intent.statIds.length > 1) {
      const p = buildReportPlan([], intent.statIds)
      plan = p
      const names = p.checklists.map((c) => groupName(c.statId))
      reply = t('companion.reportReply', { count: p.pendingTotal, names: names.join(', '), stops: 0 })
      narrationContext = `Checklists for ${names.join(', ')}: ${p.pendingTotal} pending, no map coordinates.`
    } else if (intent.kind === 'checklist') {
      const p = buildChecklistPlan(intent.statIds[0])
      if (p) {
        plan = p
        reply =
          p.pendingTotal === 0
            ? t('companion.allDone', { name: groupName(p.statId) })
            : t('companion.checklistReply', { count: p.pendingTotal, name: groupName(p.statId) })
        narrationContext = `Checklist for ${p.statId}: ${p.pendingTotal} of ${p.total} still missing. These have no map coordinates, so there is no route — only the list: ${p.pending.map((r) => `${r.label}${r.hint ? ` (${r.hint})` : ''}`).join('; ')}`
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
    <div
      className={`mx-auto flex h-[calc(100dvh-190px)] gap-4 lg:h-[calc(100dvh-110px)] ${
        artifact ? 'max-w-7xl' : 'max-w-4xl'
      }`}
    >
      {/* coluna do chat — encolhe quando o artefato abre */}
      <div className={`flex min-w-0 flex-col ${artifact ? 'hidden lg:flex lg:flex-1' : 'flex-1'}`}>
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
                  {m.plan?.type === 'collect' && (
                    <CollectPlanCard
                      plan={m.plan}
                      groupName={groupName}
                      onTrace={(p) => traceRoute([p.categoryId], p.layer, groupName(p.categoryId))}
                    />
                  )}
                  {m.plan?.type === 'armor' && <ArmorPlanCard plan={m.plan.plan} groupName={groupName} />}
                  {m.plan?.type === 'summary' && <SummaryCard plan={m.plan} />}
                  {m.plan?.type === 'checklist' && <ChecklistCard plan={m.plan} />}
                  {m.plan?.type === 'report' && <ReportCard plan={m.plan} groupName={groupName} />}
                  {m.plan?.type === 'region' && (
                    <RegionPlanCard
                      plan={m.plan.plan}
                      groupName={groupName}
                      onTrace={(p) => {
                        const region = regionById(p.regionId)
                        if (!region) return
                        const layer = p.route[0]?.layer ?? 'surface'
                        traceRoute(
                          [...new Set(p.steps.map((s) => s.categoryId))],
                          layer,
                          p.regionName,
                          region.box,
                        )
                      }}
                    />
                  )}
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

      {/* artefato: painel de rota, à direita do chat */}
      {artifact && (
        <div className="min-w-0 flex-1 lg:max-w-[26rem]">
          <RouteArtifact route={artifact.route} title={artifact.title} onClose={() => setArtifact(null)} />
        </div>
      )}
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

/**
 * Pedido combinado: uma rota só cobrindo todas as categorias com mapa, as
 * checklists dos grupos sem mapa, e o relatório em Markdown pra baixar — antes
 * só dava pra printar a tela.
 */
function ReportCard({ plan, groupName }: { plan: ReportPlan; groupName: (id: string) => string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const [copied, setCopied] = useState(false)

  /** o relatório inteiro cabe numa URL: só os bits do que falta (ver reportState) */
  const reportUrl = () => {
    const ids = [...plan.mapPending.map((g) => g.categoryId), ...plan.checklists.map((c) => c.statId)]
    const d = encodeReportState(data, manual, fromSave, ids)
    return `${location.origin}${location.pathname}#/report?d=${d}`
  }

  async function downloadReport() {
    const html = await buildReportHtml({
      title: t('companion.reportTitle'),
      layer: plan.layer,
      layerLabel: t(`map.layers.${plan.layer}`),
      stops: plan.steps.map((s) => ({ label: s.label, x: s.x, z: s.z, groupId: s.groupId })),
      mapPending: plan.mapPending.map((g) => ({
        categoryId: g.categoryId,
        label: groupName(g.categoryId),
        items: g.items,
      })),
      checklists: plan.checklists.map((c) => ({
        statId: c.statId,
        label: groupName(c.statId),
        total: c.total,
        pending: c.pending,
      })),
      strings: {
        route: t('route.title'),
        pending: t('companion.pending'),
        noRoute: t('companion.checklistNoRoute'),
        generated: t('companion.reportTitle'),
        mapHint: t('companion.reportMapHint'),
        showLine: t('companion.reportShowLine'),
        zoom: t('companion.reportZoom'),
        allGroups: t('companion.reportAllGroups'),
      },
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'zonai-codex-report.html'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel space-y-3 p-3">
      {plan.steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-ink-faint">
            {t('companion.reportRoute', { layer: plan.layer })} · {plan.steps.length}
          </p>
          <ol className="space-y-1">
            {plan.steps.slice(0, 12).map((s, i) => {
              const meta = categoryMeta(s.groupId)
              return (
                <li key={`${s.groupId}-${s.itemId}`} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px]"
                    style={{ background: meta.color, color: 'var(--color-abyss)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-mute">{s.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">
                    ({Math.round(s.x)}, {Math.round(s.z)})
                  </span>
                </li>
              )
            })}
          </ol>
          {plan.steps.length > 12 && (
            <p className="text-[11px] text-ink-faint">{t('companion.checklistMore', { count: plan.steps.length - 12 })}</p>
          )}
        </div>
      )}

      {plan.checklists.map((c) => (
        <div key={c.statId} className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-ink-faint">
            {groupName(c.statId)} · {c.pendingTotal}/{c.total}
          </p>
          <ul className="space-y-1">
            {c.pending.slice(0, 10).map((row) => (
              <li key={row.label} className="text-xs">
                <span className="text-ink">{row.label}</span>
                {row.hint && <span className="text-ink-faint"> — {row.hint}</span>}
              </li>
            ))}
          </ul>
          {c.pendingTotal > Math.min(10, c.pending.length) && (
            <p className="text-[11px] text-ink-faint">
              {t('companion.checklistMore', { count: c.pendingTotal - Math.min(10, c.pending.length) })}
            </p>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {plan.steps.length > 0 && (
          <button
            onClick={() => {
              setRoute(plan.steps)
              navigate('/map')
            }}
            className="btn-jade !px-3 !py-1.5 !text-xs"
          >
            {t('route.openFullMap')}
          </button>
        )}
        <button
          onClick={() => navigate(`/report?d=${encodeReportState(data, manual, fromSave, [...plan.mapPending.map((g) => g.categoryId), ...plan.checklists.map((c) => c.statId)])}`)}
          className="btn-jade !px-3 !py-1.5 !text-xs"
        >
          {t('report.openHere')}
        </button>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(reportUrl())
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="panel px-3 py-1.5 text-xs text-ink-mute hover:text-jade"
        >
          {copied ? t('report.copied') : t('report.copy')}
        </button>
        <button onClick={downloadReport} className="panel px-3 py-1.5 text-xs text-ink-mute hover:text-jade">
          {t('companion.downloadReport')}
        </button>
      </div>
    </div>
  )
}

function CollectPlanCard({
  plan,
  groupName,
  onTrace,
}: {
  plan: CollectPlan
  groupName: (id: string) => string
  onTrace: (plan: CollectPlan) => void
}) {
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
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onTrace(plan)} className="btn-jade !px-3 !py-1.5 !text-xs">
          {t('route.trace')}
        </button>
        <button
          onClick={() => {
            setRoute(plan.steps)
            navigate('/map')
          }}
          className="panel px-3 py-1.5 text-xs text-ink-mute transition-colors hover:text-jade"
        >
          {t('companion.showOnMap')}
        </button>
      </div>
    </div>
  )
}

function RegionPlanCard({
  plan,
  groupName,
  onTrace,
}: {
  plan: RegionPlan
  groupName: (id: string) => string
  onTrace: (plan: RegionPlan) => void
}) {
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
      <div className="flex flex-wrap items-center gap-2 border-t border-edge/60 pt-2">
        <button onClick={() => onTrace(plan)} className="btn-jade !px-3 !py-1.5 !text-xs">
          {t('route.trace')}
        </button>
        <button
          onClick={() => {
            setRoute(plan.route)
            navigate('/map')
          }}
          className="panel px-3 py-1.5 text-xs text-ink-mute transition-colors hover:text-jade"
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

function ChecklistCard({ plan }: { plan: ChecklistPlan }) {
  const { t } = useTranslation()
  const meta = categoryMeta(plan.statId)
  const shown = plan.pending.slice(0, 40)
  const hidden = plan.pendingTotal - shown.length
  // grupo completo: a mensagem de texto já diz tudo, o cartão vazio só polui
  if (plan.pending.length === 0) return null
  return (
    <div className="panel space-y-2 p-3">
      <p className="text-[10px] uppercase tracking-widest text-ink-faint">{t('companion.checklistNoRoute')}</p>
      <ul className="space-y-1">
        {shown.map((row) => (
          <li key={row.label} className="flex items-baseline gap-2 text-xs">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: meta.color }} />
            <span className="min-w-0">
              <span className="text-ink">{row.label}</span>
              {row.hint && <span className="text-ink-faint"> — {row.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="text-[11px] text-ink-faint">{t('companion.checklistMore', { count: hidden })}</p>}
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
