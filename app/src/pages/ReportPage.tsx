import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { decodeReportState, encodeReportState } from '../lib/reportState'
import { categoryMeta } from '../lib/categoryMeta'
import { itemLabel } from '../lib/itemLabel'
import { optimizeRoute, TELEPORT_CATEGORIES } from '../lib/routePlanner'
import { REGIONS, inRegion } from '../lib/regions'
import type { Progress } from '../store/appStore'

/**
 * Relatório como página do app, aberto por link.
 *
 * O save vive no desktop e o relatório é pra ler no celular, sem conta nem
 * nuvem — então o link carrega só os bits de "o que falta" (ver reportState) e
 * esta página reconstrói nomes, coordenadas, região, rota e mapa do dataset
 * local. Nada de arquivo pra transferir.
 *
 * Os ticks ficam no localStorage DESTE aparelho, presos ao link que os gerou
 * (`zc-report-<hash do link>`, um item por `grupo:id`). Esse formato não pode
 * mudar: é ele que mantém o que o usuário já marcou entre um deploy e outro.
 */

/** mesma projeção do MapPage */
const W = 4096
const H = 3413
const toPx = (x: number, z: number): [number, number] => [((x + 6000) / 12000) * W, ((5000 - z) / 10000) * H]
const regionOf = (x: number, z: number) => REGIONS.find((r) => inRegion(r, x, z))?.name ?? '—'

const LAST_KEY = 'zc-last-report'
const UI_KEY = 'zc-report-ui'
const QUEST_GROUPS = ['quests_main', 'quests_side', 'quests_adventure', 'quests_shrine']
const QUEST_COLOR = '#c084fc'

/** chave curta e estável pro payload, pra não guardar 300 chars no localStorage */
function payloadKey(payload: string): string {
  let h = 2166136261
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `zc-report-${(h >>> 0).toString(36)}`
}

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* modo privado / storage cheio */
  }
}

interface MapItem {
  key: string
  groupId: string
  label: string
  x: number
  z: number
  layer: string
  itemId: string
}
/** quest_info.json é chaveado por `grupo:id` (o mesmo formato do tick): o
 *  dataset reusa os ids entre os quatro grupos de quest */
interface QuestInfo {
  group: string
  wikiTitle: string | null
  giver?: string
  location?: string
  reward?: string
  summary?: string
  /** passos do Diário de Aventura do jogo; **x** = termo que o jogo destaca */
  steps?: string[]
  /** lugares citados nos passos que existem no mapa — pra onde ir, não onde começa */
  targets?: { name: string; x: number; z: number; layer: string }[]
  x?: number
  z?: number
  layer?: string
}
interface ListItem {
  key: string
  id: string
  label: string
  hint?: string
}
type Selection =
  | { kind: 'item'; item: MapItem }
  | { kind: 'quests'; x: number; z: number; place: string; quests: { key: string; sectionId: string; label: string }[] }

/** preferências de exibição: valem pra qualquer relatório deste aparelho */
interface UiPrefs {
  mapOpen: boolean
  hideDone: boolean
  /** escolha explícita do usuário por seção; sem escolha, abre se ainda falta algo */
  open: Record<string, boolean>
}
function loadUi(): UiPrefs {
  try {
    return { mapOpen: true, hideDone: false, open: {}, ...(JSON.parse(safeGet(UI_KEY) ?? '{}') as Partial<UiPrefs>) }
  } catch {
    return { mapOpen: true, hideDone: false, open: {} }
  }
}

/** "**termo**" vem do vermelho do Diário de Aventura: é o quê/onde da quest */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <b key={i} className="font-semibold" style={{ color: 'var(--color-gold)' }}>
            {part.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

const zeldaWikiUrl = (title: string) => `https://zeldawiki.wiki/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
/** O Zelda Dungeon fica atrás de Cloudflare e não deixa embutir; o "go" da
 *  busca do MediaWiki pula direto pra página quando o título bate. */
const zeldaDungeonUrl = (label: string) =>
  `https://www.zeldadungeon.net/wiki/index.php?search=${encodeURIComponent(label)}&go=Go`

export function ReportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const payload = params.get('d') ?? ''

  // Aberto pelo menu, sem link: volta pro último relatório deste aparelho.
  // Antes, sair da página perdia o relatório — não havia como voltar a ele.
  useEffect(() => {
    if (payload) return
    const last = safeGet(LAST_KEY)
    if (last) navigate(`/report?d=${last}`, { replace: true })
  }, [payload, navigate])

  if (!payload) return <p className="panel px-3 py-6 text-center text-sm text-ink-mute">{t('report.noLink')}</p>
  // key={payload}: remonta ao trocar de link. Reaproveitar o estado de outro
  // link gravaria os ticks dele por cima dos deste.
  return <ReportView key={payload} payload={payload} />
}

function ReportView({ payload }: { payload: string }) {
  const { t } = useTranslation()
  const data = useDataset()
  const decoded = useMemo(() => decodeReportState(data, payload), [data, payload])

  const storeKey = payloadKey(payload)
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(safeGet(storeKey) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  useEffect(() => safeSet(storeKey, JSON.stringify([...ticked])), [ticked, storeKey])
  useEffect(() => {
    if (decoded) safeSet(LAST_KEY, payload)
  }, [decoded, payload])

  const [ui, setUi] = useState<UiPrefs>(loadUi)
  useEffect(() => safeSet(UI_KEY, JSON.stringify(ui)), [ui])

  const [quests, setQuests] = useState<Record<string, QuestInfo>>({})
  useEffect(() => {
    fetch('/data/quest_info.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then(setQuests)
      .catch(() => {})
  }, [])

  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showLine, setShowLine] = useState(true)
  const [zoom, setZoom] = useState(false)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const model = useMemo(() => {
    if (!decoded) return null
    const done: Progress = {}
    for (const gid of decoded.groupIds) {
      const pend = decoded.pending.get(gid) ?? new Set()
      const marks: Record<string, 1> = {}
      const items = data.categories.find((c) => c.id === gid)?.items ?? data.stats.find((s) => s.id === gid)?.items ?? []
      for (const it of items) if (!pend.has(it.id)) marks[it.id] = 1
      done[gid] = marks
    }

    const mapGroups = decoded.groupIds
      .filter((gid) => !TELEPORT_CATEGORIES.includes(gid))
      .map((gid) => {
        const cat = data.categories.find((c) => c.id === gid)
        if (!cat) return null
        const pend = decoded.pending.get(gid) ?? new Set()
        return {
          id: gid,
          label: cat.label,
          items: cat.items
            .filter((it) => pend.has(it.id))
            .map<MapItem>((it) => ({
              key: `${gid}:${it.id}`,
              groupId: gid,
              itemId: it.id,
              label: itemLabel(it),
              x: it.x,
              z: it.z,
              layer: it.layer ?? 'surface',
            })),
        }
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.items.length > 0)

    const lists = decoded.groupIds
      .map((gid) => {
        const stat = data.stats.find((s) => s.id === gid)
        if (!stat) return null
        const pend = decoded.pending.get(gid) ?? new Set()
        return {
          id: gid,
          label: stat.label,
          total: stat.items.length,
          items: stat.items
            .filter((it) => pend.has(it.id))
            .map<ListItem>((it) => {
              const src = (it as { source?: string }).source
              return { key: `${gid}:${it.id}`, id: it.id, label: it.label ?? it.id, hint: src && src !== 'Default' ? src : undefined }
            }),
        }
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.items.length > 0)

    const byLayer = new Map<string, Set<string>>()
    for (const g of mapGroups)
      for (const it of g.items) {
        const set = byLayer.get(it.layer) ?? new Set<string>()
        set.add(g.id)
        byLayer.set(it.layer, set)
      }
    const layer = [...byLayer.entries()].sort((a, b) => b[1].size - a[1].size)[0]?.[0] ?? 'surface'

    const route = mapGroups.length
      ? optimizeRoute(data, {}, done, { categories: new Set(mapGroups.map((g) => g.id)), layer, origin: null, maxStops: 500 })
      : null

    return { mapGroups, lists, layer, route }
  }, [decoded, data])

  if (!decoded || !model)
    return (
      <p className="panel px-3 py-6 text-center text-sm" style={{ color: 'var(--color-gloom)' }}>
        {t('report.badLink')}
      </p>
    )

  const { mapGroups, lists, layer, route } = model
  const stops = route?.stops ?? []
  const hideDone = ui.hideDone
  // perna concluída não precisa mais de linha nem de teleporte: com o mapa todo
  // feito, sobravam 65 marcadores de teleporte apontando pra lugar nenhum
  const legs = (route?.legs ?? []).filter((leg) => leg.stops.some((s) => !ticked.has(`${s.groupId}:${s.itemId}`)))

  const orderOf = new Map<string, number>()
  stops.forEach((s, i) => orderOf.set(`${Math.round(s.x)}|${Math.round(s.z)}`, i + 1))

  const onLayer = mapGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.layer === layer) }))
    .filter((g) => g.items.length)

  // quests pendentes com local conhecido na camada do mapa, agrupadas por
  // ponto: várias quests saem do mesmo lugar (Lookout Landing tem dezenas)
  const questClusters = new Map<string, { x: number; z: number; place: string; quests: { key: string; sectionId: string; label: string }[] }>()
  for (const l of lists) {
    if (!QUEST_GROUPS.includes(l.id)) continue
    for (const it of l.items) {
      const q = quests[it.key]
      if (!q || q.x === undefined || q.z === undefined || (q.layer ?? 'surface') !== layer) continue
      if (hideDone && ticked.has(it.key)) continue
      const ck = `${q.x}|${q.z}`
      const c = questClusters.get(ck) ?? { x: q.x, z: q.z, place: q.location ?? '', quests: [] }
      c.quests.push({ key: it.key, sectionId: l.id, label: it.label })
      questClusters.set(ck, c)
    }
  }
  const questPinCount = [...questClusters.values()].reduce((n, c) => n + c.quests.length, 0)

  const allItems = [...onLayer.flatMap((g) => g.items.map((i) => i.key)), ...lists.flatMap((l) => l.items.map((i) => i.key))]
  const doneCount = allItems.filter((k) => ticked.has(k)).length

  /** Marcador com tamanho CONSTANTE na tela: ampliado, o SVG renderiza em 1:2;
   *  sem compensar, as bolinhas viram manchas. */
  const k = zoom ? 0.42 : 1
  const rDot = 16 * k
  const rStop = 30 * k
  const rWarp = 26 * k

  const sectionRemaining = (id: string) => {
    const g = onLayer.find((x) => x.id === id)
    const l = lists.find((x) => x.id === id)
    const keys = g ? g.items.map((i) => i.key) : l ? l.items.map((i) => i.key) : []
    return keys.filter((kk) => !ticked.has(kk)).length
  }
  /** Seção concluída começa recolhida — o caso que motivou isto era rolar os
   *  22 poços já feitos pra chegar nas quests. */
  const isOpen = (id: string) => ui.open[id] ?? sectionRemaining(id) > 0
  const setOpen = (id: string, v: boolean) => setUi((p) => ({ ...p, open: { ...p.open, [id]: v } }))
  const allSectionIds = [...onLayer.map((g) => g.id), ...lists.map((l) => l.id)]

  /** leva até a linha na lista: abre a seção, rola e destaca */
  function focusRow(sectionId: string, key: string) {
    setOpen(sectionId, true)
    if (QUEST_GROUPS.includes(sectionId)) setExpanded(key)
    if (hideDone && ticked.has(key)) setUi((p) => ({ ...p, hideDone: false }))
    setFlash(key)
    setTimeout(() => document.getElementById(`row-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    setTimeout(() => setFlash(null), 1800)
  }
  /** o caminho inverso: da quest na lista pro ponto no mapa */
  function focusMap(sel: Selection) {
    setUi((p) => ({ ...p, mapOpen: true }))
    if (sel.kind === 'quests') setHidden((h) => { const n = new Set(h); n.delete('quests'); return n })
    setSelected(sel)
    setTimeout(() => document.getElementById('report-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  function copyUpdated() {
    // regrava os bits já contando o que foi tickado aqui
    const manual: Progress = {}
    for (const key of ticked) {
      const [gid, ...rest] = key.split(':')
      manual[gid] = { ...(manual[gid] ?? {}), [rest.join(':')]: 1 }
    }
    const done: Progress = {}
    for (const gid of decoded!.groupIds) {
      const pend = decoded!.pending.get(gid) ?? new Set()
      const items = data.categories.find((c) => c.id === gid)?.items ?? data.stats.find((s) => s.id === gid)?.items ?? []
      const marks: Record<string, 1> = {}
      for (const it of items) if (!pend.has(it.id)) marks[it.id] = 1
      done[gid] = marks
    }
    const d = encodeReportState(data, manual, done, decoded!.groupIds)
    navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/report?d=${d}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  const selectedItem = selected?.kind === 'item' ? selected.item : null
  const selectedOrder = selectedItem ? orderOf.get(`${Math.round(selectedItem.x)}|${Math.round(selectedItem.z)}`) : undefined

  function tickUpTo(n: number) {
    const keys = onLayer.flatMap((g) =>
      g.items
        .filter((it) => {
          const o = orderOf.get(`${Math.round(it.x)}|${Math.round(it.z)}`)
          return o !== undefined && o <= n
        })
        .map((it) => it.key),
    )
    setTicked((prev) => new Set([...prev, ...keys]))
    setSelected(null)
  }

  const chip = (on: boolean) => ({
    borderColor: on ? 'var(--color-gold)' : 'var(--color-edge)',
    color: on ? 'var(--color-gold)' : 'var(--color-ink-mute)',
  })
  const pill = 'rounded-full border px-3 py-1.5 text-[11px]'

  const SectionHeader = ({ id, color, label, left, total }: { id: string; color?: string; label: string; left: number; total: number }) => {
    const open = isOpen(id)
    return (
      <button onClick={() => setOpen(id, !open)} className="flex w-full items-center gap-2 border-b border-edge pb-1.5 text-left">
        <span className="w-3 text-[10px] text-ink-faint">{open ? '▾' : '▸'}</span>
        {color && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
        <span className="flex-1 font-display text-sm">{label}</span>
        <span className="font-mono text-[11px]" style={{ color: left === 0 ? 'var(--color-jade)' : 'var(--color-ink-faint)' }}>
          {left === 0 ? '✓' : `${left}/${total}`}
        </span>
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* barra fixa: progresso e os controles que valem pra página inteira */}
      <div className="sticky top-0 z-20 -mt-1 mb-3 border-b border-edge py-2" style={{ background: 'var(--color-abyss)' }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-auto">
            <span className="block font-display text-base leading-tight">{t('report.title')}</span>
            <span className="font-mono text-[10px] text-ink-faint">{t('report.progress', { done: doneCount, total: allItems.length })}</span>
          </span>
          <button onClick={() => setUi((p) => ({ ...p, hideDone: !p.hideDone }))} className={pill} style={chip(hideDone)}>
            {t('report.hideDone')}
          </button>
          <button
            onClick={() => {
              const anyOpen = allSectionIds.some(isOpen) || ui.mapOpen
              setUi((p) => ({ ...p, mapOpen: !anyOpen, open: Object.fromEntries(allSectionIds.map((id) => [id, !anyOpen])) }))
            }}
            className={pill}
            style={chip(false)}
          >
            {allSectionIds.some(isOpen) || ui.mapOpen ? t('report.collapseAll') : t('report.expandAll')}
          </button>
        </div>
      </div>

      {onLayer.length > 0 && (
        <div id="report-map" className="panel mb-4 overflow-hidden" style={{ scrollMarginTop: 72 }}>
          <button
            onClick={() => setUi((p) => ({ ...p, mapOpen: !p.mapOpen }))}
            className="flex w-full items-center gap-2 border-b border-edge px-2.5 py-2 text-left"
          >
            <span className="w-3 text-[10px] text-ink-faint">{ui.mapOpen ? '▾' : '▸'}</span>
            <span className="flex-1 font-display text-sm">{t('report.map')}</span>
            <span className="text-[11px] text-ink-faint">{t(`map.layers.${layer}`)}</span>
          </button>

          {ui.mapOpen && (
            <>
              <div className="overflow-auto bg-abyss" style={{ maxHeight: zoom ? '70vh' : undefined }}>
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  style={{ display: 'block', width: zoom ? `${W / 2}px` : '100%', maxWidth: zoom ? 'none' : undefined, height: 'auto' }}
                >
                  <image href={`/map/${layer}.webp`} x={0} y={0} width={W} height={H} opacity={0.75} />

                  {/* a linha quebra onde houve teleporte: ligar os dois desenharia uma caminhada que não existe */}
                  {showLine &&
                    legs.map((leg, li) =>
                      leg.stops.length < 2 ? null : (
                        <path
                          key={`leg-${li}`}
                          d={`M${leg.stops.map((s) => toPx(s.x, s.z).join(' ')).join(' L')}`}
                          fill="none"
                          stroke="#e8d9a8"
                          strokeWidth={5 * k}
                          strokeDasharray={`${20 * k} ${18 * k}`}
                          opacity={0.7}
                        />
                      ),
                    )}

                  {showLine &&
                    legs.map((leg, li) => {
                      if (!leg.anchor || !leg.stops.length) return null
                      const [ax, ay] = toPx(leg.anchor.x, leg.anchor.z)
                      const [sx, sy] = toPx(leg.stops[0].x, leg.stops[0].z)
                      return (
                        <g key={`warp-${li}`}>
                          <line x1={ax} y1={ay} x2={sx} y2={sy} stroke="#5fd3a6" strokeWidth={4 * k} strokeDasharray={`${6 * k} ${14 * k}`} opacity={0.75} />
                          <circle cx={ax} cy={ay} r={rWarp} fill="#0b1210" stroke="#5fd3a6" strokeWidth={5 * k} />
                          <text x={ax} y={ay + 9 * k} textAnchor="middle" fontSize={26 * k} fontWeight={700} fill="#5fd3a6">
                            ⇢
                          </text>
                          <title>{`${t('report.warpHere')}: ${leg.anchor.label}`}</title>
                        </g>
                      )
                    })}

                  {onLayer
                    .filter((g) => !hidden.has(g.id))
                    .map((g) => (
                      <g key={g.id}>
                        {g.items
                          .filter((it) => !(hideDone && ticked.has(it.key)))
                          .map((it) => {
                            const [px, py] = toPx(it.x, it.z)
                            const n = orderOf.get(`${Math.round(it.x)}|${Math.round(it.z)}`)
                            const off = ticked.has(it.key)
                            const isSel = selectedItem?.key === it.key
                            return (
                              <g key={it.key} onClick={() => setSelected({ kind: 'item', item: it })} style={{ cursor: 'pointer', opacity: off ? 0.3 : 1 }}>
                                <circle
                                  cx={px}
                                  cy={py}
                                  r={n === undefined ? rDot : rStop}
                                  fill={off ? '#5a6b62' : categoryMeta(g.id).color}
                                  stroke={isSel ? '#ffffff' : '#0b1210'}
                                  strokeWidth={(isSel ? 8 : n === undefined ? 4 : 6) * k}
                                />
                                {n !== undefined && !off && (
                                  <text x={px} y={py + 11 * k} textAnchor="middle" fontSize={32 * k} fontWeight={700} fill="#0b1210">
                                    {n}
                                  </text>
                                )}
                                <title>{n === undefined ? it.label : `${n}. ${it.label}`}</title>
                              </g>
                            )
                          })}
                      </g>
                    ))}

                  {/* quests: losango roxo, com a contagem quando várias saem do mesmo lugar */}
                  {!hidden.has('quests') &&
                    [...questClusters.values()].map((c) => {
                      const [px, py] = toPx(c.x, c.z)
                      const s = 24 * k
                      const allDone = c.quests.every((q) => ticked.has(q.key))
                      const isSel = selected?.kind === 'quests' && selected.x === c.x && selected.z === c.z
                      return (
                        <g key={`q-${c.x}-${c.z}`} onClick={() => setSelected({ kind: 'quests', ...c })} style={{ cursor: 'pointer', opacity: allDone ? 0.3 : 1 }}>
                          <rect
                            x={px - s}
                            y={py - s}
                            width={s * 2}
                            height={s * 2}
                            transform={`rotate(45 ${px} ${py})`}
                            fill={allDone ? '#5a6b62' : QUEST_COLOR}
                            stroke={isSel ? '#ffffff' : '#0b1210'}
                            strokeWidth={(isSel ? 8 : 5) * k}
                          />
                          {c.quests.length > 1 && (
                            <text x={px} y={py + 10 * k} textAnchor="middle" fontSize={28 * k} fontWeight={700} fill="#0b1210">
                              {c.quests.length}
                            </text>
                          )}
                          <title>{`${c.place}: ${c.quests.map((q) => q.label).join(', ')}`}</title>
                        </g>
                      )
                    })}

                  {/* destino de quest (pra onde ir, não onde começa): só existe
                      enquanto selecionado, num alvo com mira */}
                  {selected?.kind === 'quests' && !questClusters.has(`${selected.x}|${selected.z}`) && (() => {
                    const [px, py] = toPx(selected.x, selected.z)
                    return (
                      <g pointerEvents="none">
                        <circle cx={px} cy={py} r={34 * k} fill="none" stroke="#ffffff" strokeWidth={5 * k} />
                        <circle cx={px} cy={py} r={16 * k} fill={QUEST_COLOR} stroke="#0b1210" strokeWidth={4 * k} />
                        <path d={`M${px - 52 * k} ${py}H${px - 38 * k}M${px + 38 * k} ${py}H${px + 52 * k}M${px} ${py - 52 * k}V${py - 38 * k}M${px} ${py + 38 * k}V${py + 52 * k}`} stroke="#ffffff" strokeWidth={5 * k} />
                      </g>
                    )
                  })()}
                </svg>
              </div>

              {selected?.kind === 'item' && (
                <div className="flex flex-wrap items-center gap-2 border-t border-edge bg-stone-2 p-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{selected.item.label}</span>
                    <span className="font-mono text-[10px] text-ink-faint">
                      {regionOf(selected.item.x, selected.item.z)} · {Math.round(selected.item.x)}, {Math.round(selected.item.z)}
                    </span>
                  </span>
                  <button onClick={() => toggle(selected.item.key)} className={pill} style={chip(ticked.has(selected.item.key))}>
                    {ticked.has(selected.item.key) ? t('report.untick') : t('report.tick')}
                  </button>
                  {selectedOrder !== undefined && (
                    <button onClick={() => tickUpTo(selectedOrder)} className={pill} style={chip(false)}>
                      {t('report.tickUpTo', { n: selectedOrder })}
                    </button>
                  )}
                  <button onClick={() => focusRow(selected.item.groupId, selected.item.key)} className={pill} style={chip(false)}>
                    {t('report.inList')}
                  </button>
                  <button onClick={() => setSelected(null)} className="px-2 text-ink-faint">
                    ✕
                  </button>
                </div>
              )}

              {selected?.kind === 'quests' && (
                <div className="border-t border-edge bg-stone-2 p-2.5">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{selected.place}</span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        {regionOf(selected.x, selected.z) !== '—' && `${regionOf(selected.x, selected.z)} · `}
                        {t('report.questsHere', { count: selected.quests.length })}
                      </span>
                    </span>
                    <button onClick={() => setSelected(null)} className="px-2 text-ink-faint">
                      ✕
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {selected.quests.map((q) => (
                      <li key={q.key} className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={ticked.has(q.key)} onChange={() => toggle(q.key)} className="h-4 w-4 shrink-0 accent-jade" />
                        <span className="min-w-0 flex-1 truncate" style={ticked.has(q.key) ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}>
                          {q.label}
                        </span>
                        <button onClick={() => focusRow(q.sectionId, q.key)} className="shrink-0 text-[11px] underline decoration-edge-lit underline-offset-2">
                          {t('report.details')}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 border-t border-edge p-2.5">
                <button onClick={() => setShowLine((v) => !v)} className={pill} style={chip(showLine)}>
                  {t('companion.reportShowLine')}
                </button>
                <button onClick={() => setZoom((v) => !v)} className={pill} style={chip(zoom)}>
                  {t('companion.reportZoom')}
                </button>
                {[...onLayer.map((g) => ({ id: g.id, label: g.label, color: categoryMeta(g.id).color, left: g.items.filter((i) => !ticked.has(i.key)).length })),
                  ...(questPinCount ? [{ id: 'quests', label: t('report.questsOnMap'), color: QUEST_COLOR, left: [...questClusters.values()].flatMap((c) => c.quests).filter((q) => !ticked.has(q.key)).length }] : []),
                ].map((g) => (
                  <button
                    key={g.id}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev)
                        if (next.has(g.id)) next.delete(g.id)
                        else next.add(g.id)
                        return next
                      })
                    }
                    className={pill}
                    style={{ borderColor: 'var(--color-edge)', opacity: hidden.has(g.id) ? 0.45 : 1, color: 'var(--color-ink)' }}
                  >
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: g.color }} />
                    {g.label} <b className="font-mono">{g.left}</b>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-edge p-2.5">
                <span className="flex-1 text-[11px] text-ink-faint">{t('report.tickHint')}</span>
                <button onClick={copyUpdated} className={pill} style={chip(copied)}>
                  {copied ? t('report.copied') : t('report.copyUpdated')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {onLayer.map((g) => {
        const left = g.items.filter((i) => !ticked.has(i.key)).length
        return (
          <section key={g.id} className="mb-3">
            <SectionHeader id={g.id} color={categoryMeta(g.id).color} label={g.label} left={left} total={g.items.length} />
            {isOpen(g.id) && (
              <ul className="mt-1 grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
                {g.items
                  .filter((it) => !(hideDone && ticked.has(it.key)))
                  .map((it) => {
                    const off = ticked.has(it.key)
                    const n = orderOf.get(`${Math.round(it.x)}|${Math.round(it.z)}`)
                    return (
                      <li
                        key={it.key}
                        id={`row-${it.key}`}
                        className="flex items-baseline gap-2 rounded py-1 transition-colors"
                        style={{ scrollMarginTop: 72, background: flash === it.key ? 'rgba(217,185,106,.18)' : undefined }}
                      >
                        <input type="checkbox" checked={off} onChange={() => toggle(it.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-jade" />
                        {n !== undefined && <span className="w-6 shrink-0 text-right font-mono text-[10px]" style={{ color: 'var(--color-gold)' }}>{n}</span>}
                        <button
                          onClick={() => focusMap({ kind: 'item', item: it })}
                          className="min-w-0 flex-1 truncate text-left"
                          style={off ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}
                        >
                          {it.label}
                        </button>
                        <span className="shrink-0 text-[11px]" style={{ color: 'var(--color-gold)' }}>{regionOf(it.x, it.z)}</span>
                      </li>
                    )
                  })}
              </ul>
            )}
          </section>
        )
      })}

      {lists.map((l) => {
        const left = l.items.filter((i) => !ticked.has(i.key)).length
        const isQuest = QUEST_GROUPS.includes(l.id)
        return (
          <section key={l.id} className="mb-3">
            <SectionHeader id={l.id} label={l.label} left={left} total={l.total} />
            {isOpen(l.id) && (
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {l.items
                  .filter((it) => !(hideDone && ticked.has(it.key)))
                  .map((it) => {
                    const off = ticked.has(it.key)
                    const q = isQuest ? quests[it.key] : undefined
                    const open = expanded === it.key
                    return (
                      <li
                        key={it.key}
                        id={`row-${it.key}`}
                        className="rounded py-1 transition-colors"
                        style={{ scrollMarginTop: 72, background: flash === it.key ? 'rgba(217,185,106,.18)' : undefined }}
                      >
                        <div className="flex items-baseline gap-2">
                          <input type="checkbox" checked={off} onChange={() => toggle(it.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-jade" />
                          <button
                            onClick={() => (isQuest ? setExpanded(open ? null : it.key) : undefined)}
                            className="min-w-0 flex-1 text-left"
                            style={off ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}
                          >
                            {it.label}
                            {it.hint && <span className="text-ink-faint"> — {it.hint}</span>}
                            {isQuest && q?.location && <span className="text-[11px]" style={{ color: 'var(--color-gold)' }}> · {q.location}</span>}
                          </button>
                          {isQuest && <span className="shrink-0 text-[10px] text-ink-faint">{open ? '▾' : '▸'}</span>}
                        </div>

                        {open && isQuest && (
                          <div className="ml-6 mt-1.5 space-y-1.5 border-l border-edge pl-3 text-[12px] text-ink-mute">
                            {q ? (
                              <>
                                {q.giver && (
                                  <p>
                                    <span className="text-ink-faint">{t('report.giver')}: </span>
                                    {q.giver}
                                  </p>
                                )}
                                {q.location && (
                                  <p>
                                    <span className="text-ink-faint">{t('report.where')}: </span>
                                    {q.location}
                                    {q.x !== undefined && q.z !== undefined && <span className="text-ink-faint"> · {regionOf(q.x, q.z)}</span>}
                                  </p>
                                )}
                                {q.steps && q.steps.length > 0 && (
                                  <ol className="space-y-1.5 text-ink">
                                    {q.steps.map((st, si) => (
                                      <li key={si} className="flex gap-2 leading-relaxed">
                                        {q.steps!.length > 1 && <span className="shrink-0 font-mono text-[10px] text-ink-faint">{si + 1}.</span>}
                                        <span className="whitespace-pre-line">
                                          <Rich text={st} />
                                        </span>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                                {q.targets && q.targets.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-ink-faint">{t('report.goTo')}:</span>
                                    {q.targets.map((tg) =>
                                      tg.layer === layer ? (
                                        <button
                                          key={tg.name}
                                          onClick={() => focusMap({ kind: 'quests', x: tg.x, z: tg.z, place: tg.name, quests: [{ key: it.key, sectionId: l.id, label: it.label }] })}
                                          className={pill}
                                          style={chip(true)}
                                        >
                                          ◆ {tg.name}
                                          {regionOf(tg.x, tg.z) !== '—' && ` · ${regionOf(tg.x, tg.z)}`}
                                        </button>
                                      ) : (
                                        <span key={tg.name} className="text-[11px]">
                                          {tg.name} <span className="text-ink-faint">({t(`map.layers.${tg.layer}`)})</span>
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                                {q.reward && (
                                  <p>
                                    <span className="text-ink-faint">{t('report.reward')}: </span>
                                    {q.reward}
                                  </p>
                                )}
                                {!q.steps?.length && q.summary && <p className="leading-relaxed text-ink">{q.summary}</p>}
                              </>
                            ) : (
                              <p className="text-ink-faint">{t('report.noQuestInfo')}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {q?.x !== undefined && q?.z !== undefined && (q.layer ?? 'surface') === layer && (
                                <button
                                  onClick={() => {
                                    const c = questClusters.get(`${q.x}|${q.z}`)
                                    focusMap({ kind: 'quests', x: q.x!, z: q.z!, place: q.location ?? '', quests: c?.quests ?? [{ key: it.key, sectionId: l.id, label: it.label }] })
                                  }}
                                  className={pill}
                                  style={chip(false)}
                                >
                                  {t('report.startOnMap')}
                                </button>
                              )}
                              <a href={zeldaDungeonUrl(it.label)} target="_blank" rel="noreferrer" className={pill} style={chip(false)}>
                                Zelda Dungeon ↗
                              </a>
                              {q?.wikiTitle && (
                                <a href={zeldaWikiUrl(q.wikiTitle)} target="_blank" rel="noreferrer" className={pill} style={chip(false)}>
                                  Zelda Wiki ↗
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
