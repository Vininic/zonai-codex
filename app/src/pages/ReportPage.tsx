import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { decodeReportState, encodeReportState } from '../lib/reportState'
import { categoryMeta } from '../lib/categoryMeta'
import { itemLabel } from '../lib/itemLabel'
import { optimizeRoute } from '../lib/routePlanner'
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
 * Os ticks feitos aqui ficam no localStorage DESTE aparelho, presos ao link
 * que os gerou: marcar coisa no celular não pode alterar a URL que você já
 * mandou pra si mesmo. Pra levar o progresso de volta existe o botão de copiar
 * link atualizado, que regrava os bits com o que você já pegou.
 */

/** mesma projeção do MapPage */
const W = 4096
const H = 3413
const toPx = (x: number, z: number): [number, number] => [((x + 6000) / 12000) * W, ((5000 - z) / 10000) * H]
const regionOf = (x: number, z: number) => REGIONS.find((r) => inRegion(r, x, z))?.name ?? '—'

/** chave curta e estável pro payload, pra não guardar 280 chars no localStorage */
function payloadKey(payload: string): string {
  let h = 2166136261
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `zc-report-${(h >>> 0).toString(36)}`
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

export function ReportPage() {
  const { t } = useTranslation()
  const data = useDataset()
  const [params] = useSearchParams()
  const payload = params.get('d') ?? ''

  const decoded = useMemo(() => (payload ? decodeReportState(data, payload) : null), [data, payload])

  const storeKey = payloadKey(payload)
  const [ticked, setTicked] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(payloadKey(payload)) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify([...ticked]))
    } catch {
      /* modo privado / storage cheio: os ticks valem só nesta sessão */
    }
  }, [ticked, storeKey])

  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showLine, setShowLine] = useState(true)
  const [hideDone, setHideDone] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [selected, setSelected] = useState<MapItem | null>(null)
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
            .map((it) => {
              const src = (it as { source?: string }).source
              return { key: `${gid}:${it.id}`, label: it.label ?? it.id, hint: src && src !== 'Default' ? src : undefined }
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
      ? optimizeRoute(data, {}, done, {
          categories: new Set(mapGroups.map((g) => g.id)),
          layer,
          origin: null,
          maxStops: 500,
        })
      : null

    return { mapGroups, lists, layer, route }
  }, [decoded, data])

  if (!payload) return <p className="panel px-3 py-6 text-center text-sm text-ink-mute">{t('report.noLink')}</p>
  if (!decoded || !model)
    return (
      <p className="panel px-3 py-6 text-center text-sm" style={{ color: 'var(--color-gloom)' }}>
        {t('report.badLink')}
      </p>
    )

  const { mapGroups, lists, layer, route } = model
  const stops = route?.stops ?? []
  const legs = route?.legs ?? []

  const orderOf = new Map<string, number>()
  stops.forEach((s, i) => orderOf.set(`${Math.round(s.x)}|${Math.round(s.z)}`, i + 1))

  const onLayer = mapGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.layer === layer) }))
    .filter((g) => g.items.length)

  const allItems = [...onLayer.flatMap((g) => g.items.map((i) => i.key)), ...lists.flatMap((l) => l.items.map((i) => i.key))]
  const doneCount = allItems.filter((k) => ticked.has(k)).length

  /** Marcador precisa ter tamanho CONSTANTE na tela. Ampliado, o SVG renderiza
   *  em 1:2 do original; sem compensar, as bolinhas viram manchas. */
  const k = zoom ? 0.42 : 1
  const rDot = 16 * k
  const rStop = 30 * k
  const rWarp = 26 * k

  function copyUpdated() {
    // regrava os bits já contando o que foi tickado aqui
    const manual: Progress = {}
    for (const key of ticked) {
      const [gid, ...rest] = key.split(':')
      const id = rest.join(':')
      manual[gid] = { ...(manual[gid] ?? {}), [id]: 1 }
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

  const chip = (on: boolean) => ({
    borderColor: on ? 'var(--color-gold)' : 'var(--color-edge)',
    color: on ? 'var(--color-gold)' : 'var(--color-ink-mute)',
  })

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="font-display text-lg">{t('report.title')}</h2>
      <p className="mb-3 text-xs text-ink-faint">
        {t('report.progress', { done: doneCount, total: allItems.length })}
      </p>

      {onLayer.length > 0 && (
        <div className="panel mb-4 overflow-hidden">
          <div className="overflow-auto bg-abyss" style={{ maxHeight: zoom ? '70vh' : undefined }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ display: 'block', width: zoom ? `${W / 2}px` : '100%', maxWidth: zoom ? 'none' : undefined, height: 'auto' }}
            >
              <image href={`/map/${layer}.webp`} x={0} y={0} width={W} height={H} opacity={0.75} />

              {/* a linha quebra onde houve teleporte: ligar os dois desenharia
                  uma caminhada que não existe */}
              {showLine &&
                legs.map((leg, li) => {
                  const pts = leg.stops.map((s) => toPx(s.x, s.z).join(' ')).join(' L')
                  if (leg.stops.length < 2) return null
                  return (
                    <path
                      key={`leg-${li}`}
                      d={`M${pts.replace(/^/, '')}`}
                      fill="none"
                      stroke="#e8d9a8"
                      strokeWidth={5 * k}
                      strokeDasharray={`${20 * k} ${18 * k}`}
                      opacity={0.7}
                    />
                  )
                })}

              {/* onde vale teleportar: liga o ponto de viagem rápida à 1a parada da perna */}
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
                        const color = categoryMeta(g.id).color
                        const off = ticked.has(it.key)
                        const isSel = selected?.key === it.key
                        return (
                          <g
                            key={it.key}
                            onClick={() => setSelected(it)}
                            style={{ cursor: 'pointer', opacity: off ? 0.3 : 1 }}
                          >
                            <circle
                              cx={px}
                              cy={py}
                              r={n === undefined ? rDot : rStop}
                              fill={off ? '#5a6b62' : color}
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
            </svg>
          </div>

          {selected && (
            <div className="flex flex-wrap items-center gap-2 border-t border-edge bg-stone-2 p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{selected.label}</span>
                <span className="font-mono text-[10px] text-ink-faint">
                  {regionOf(selected.x, selected.z)} · {Math.round(selected.x)}, {Math.round(selected.z)}
                </span>
              </span>
              <button
                onClick={() => toggle(selected.key)}
                className="rounded-full border px-3 py-1.5 text-[11px]"
                style={chip(ticked.has(selected.key))}
              >
                {ticked.has(selected.key) ? t('report.untick') : t('report.tick')}
              </button>
              <button onClick={() => setSelected(null)} className="px-2 text-ink-faint">
                ✕
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 border-t border-edge p-2.5">
            <button onClick={() => setShowLine((v) => !v)} className="rounded-full border px-3 py-1.5 text-[11px]" style={chip(showLine)}>
              {t('companion.reportShowLine')}
            </button>
            <button onClick={() => setZoom((v) => !v)} className="rounded-full border px-3 py-1.5 text-[11px]" style={chip(zoom)}>
              {t('companion.reportZoom')}
            </button>
            <button onClick={() => setHideDone((v) => !v)} className="rounded-full border px-3 py-1.5 text-[11px]" style={chip(hideDone)}>
              {t('report.hideDone')}
            </button>
            {onLayer.map((g) => {
              const on = !hidden.has(g.id)
              const left = g.items.filter((i) => !ticked.has(i.key)).length
              return (
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
                  className="rounded-full border px-3 py-1.5 text-[11px]"
                  style={{ borderColor: 'var(--color-edge)', opacity: on ? 1 : 0.45, color: 'var(--color-ink)' }}
                >
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: categoryMeta(g.id).color }} />
                  {g.label} <b className="font-mono">{left}</b>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-edge p-2.5">
            <span className="flex-1 text-[11px] text-ink-faint">{t('report.tickHint')}</span>
            <button onClick={copyUpdated} className="rounded-full border px-3 py-1.5 text-[11px]" style={chip(copied)}>
              {copied ? t('report.copied') : t('report.copyUpdated')}
            </button>
          </div>
        </div>
      )}

      {onLayer.map((g) => (
        <section key={g.id} className="mb-4">
          <h3 className="mb-2 border-b border-edge pb-1.5 font-display text-sm">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: categoryMeta(g.id).color }} />
            {g.label} <span className="text-[11px] text-ink-faint">{g.items.filter((i) => !ticked.has(i.key)).length}/{g.items.length}</span>
          </h3>
          <ul className="grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
            {g.items
              .filter((it) => !(hideDone && ticked.has(it.key)))
              .map((it) => {
                const off = ticked.has(it.key)
                const n = orderOf.get(`${Math.round(it.x)}|${Math.round(it.z)}`)
                return (
                  <li key={it.key} className="flex items-baseline gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={off}
                      onChange={() => toggle(it.key)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-jade"
                    />
                    {n !== undefined && <span className="w-6 shrink-0 text-right font-mono text-[10px]" style={{ color: 'var(--color-gold)' }}>{n}</span>}
                    <span className="min-w-0 flex-1 truncate" style={off ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}>
                      {it.label}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: 'var(--color-gold)' }}>{regionOf(it.x, it.z)}</span>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}

      {lists.map((l) => (
        <section key={l.id} className="mb-4">
          <h3 className="mb-2 border-b border-edge pb-1.5 font-display text-sm">
            {l.label} <span className="text-[11px] text-ink-faint">{l.items.filter((i) => !ticked.has(i.key)).length}/{l.total}</span>
          </h3>
          <ul className="grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
            {l.items
              .filter((it) => !(hideDone && ticked.has(it.key)))
              .map((it) => {
                const off = ticked.has(it.key)
                return (
                  <li key={it.key} className="flex items-baseline gap-2 py-1">
                    <input type="checkbox" checked={off} onChange={() => toggle(it.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-jade" />
                    <span className="min-w-0 flex-1" style={off ? { opacity: 0.45, textDecoration: 'line-through' } : undefined}>
                      {it.label}
                      {it.hint && <span className="text-ink-faint"> — {it.hint}</span>}
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}
