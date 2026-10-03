import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { decodeReportState } from '../lib/reportState'
import { categoryMeta } from '../lib/categoryMeta'
import { itemLabel } from '../lib/itemLabel'
import { optimizeRoute } from '../lib/routePlanner'
import { REGIONS, inRegion } from '../lib/regions'
import type { Progress } from '../store/appStore'

/**
 * Relatório como página do app, aberto por link.
 *
 * O save vive no desktop e o relatório é pra ler no celular, sem conta nem
 * nuvem — então o link carrega só os bits de "o que falta" (ver reportState)
 * e esta página reconstrói tudo do dataset local: nomes, coordenadas, rota e
 * o mapa. Nada de arquivo pra transferir.
 */

/** mesma projeção do MapPage */
const W = 4096
const H = 3413
const toPx = (x: number, z: number): [number, number] => [((x + 6000) / 12000) * W, ((5000 - z) / 10000) * H]
const regionOf = (x: number, z: number) => REGIONS.find((r) => inRegion(r, x, z))?.name ?? '—'

export function ReportPage() {
  const { t } = useTranslation()
  const data = useDataset()
  const [params] = useSearchParams()
  const payload = params.get('d') ?? ''

  const decoded = useMemo(() => (payload ? decodeReportState(data, payload) : null), [data, payload])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showLine, setShowLine] = useState(true)
  const [zoom, setZoom] = useState(false)

  const model = useMemo(() => {
    if (!decoded) return null
    // o planner trabalha com "o que já foi feito"; aqui temos o inverso
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
            .map((it) => ({ label: itemLabel(it), x: it.x, z: it.z, layer: it.layer ?? 'surface' })),
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
            .map((it) => ({
              label: it.label ?? it.id,
              hint: (it as { source?: string }).source && (it as { source?: string }).source !== 'Default'
                ? (it as { source?: string }).source
                : undefined,
            })),
        }
      })
      .filter((g): g is NonNullable<typeof g> => !!g && g.items.length > 0)

    // camada com mais GRUPOS representados (ver buildReportPlan no Companion)
    const byLayer = new Map<string, Set<string>>()
    for (const g of mapGroups) for (const it of g.items) {
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
        }).stops
      : []

    return { mapGroups, lists, layer, route }
  }, [decoded, data])

  if (!payload) return <p className="panel px-3 py-6 text-center text-sm text-ink-mute">{t('report.noLink')}</p>
  if (!decoded || !model) return <p className="panel px-3 py-6 text-center text-sm" style={{ color: 'var(--color-gloom)' }}>{t('report.badLink')}</p>

  const { mapGroups, lists, layer, route } = model
  const orderOf = new Map<string, number>()
  route.forEach((s, i) => orderOf.set(`${Math.round(s.x)}|${Math.round(s.z)}`, i + 1))
  const onLayer = mapGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.layer === layer) }))
    .filter((g) => g.items.length)
  const totalMap = onLayer.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="font-display text-lg">{t('report.title')}</h2>
      <p className="mb-3 text-xs text-ink-faint">{t('report.sub', { count: totalMap + lists.reduce((n, l) => n + l.items.length, 0) })}</p>

      {onLayer.length > 0 && (
        <div className="panel mb-4 overflow-hidden">
          <div className={`overflow-auto bg-abyss ${zoom ? '' : ''}`} style={{ maxHeight: zoom ? '75vh' : undefined }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ display: 'block', width: zoom ? `${W / 2}px` : '100%', maxWidth: zoom ? 'none' : undefined, height: 'auto' }}
            >
              <image href={`/map/${layer}.webp`} x={0} y={0} width={W} height={H} opacity={0.75} />
              {showLine && route.length > 1 && (
                <polyline
                  points={route.map((s) => toPx(s.x, s.z).join(',')).join(' ')}
                  fill="none"
                  stroke="#e8d9a8"
                  strokeWidth={5}
                  strokeDasharray="20 18"
                  opacity={0.75}
                />
              )}
              {onLayer
                .filter((g) => !hidden.has(g.id))
                .map((g) => (
                  <g key={g.id}>
                    {g.items.map((it) => {
                      const [px, py] = toPx(it.x, it.z)
                      const n = orderOf.get(`${Math.round(it.x)}|${Math.round(it.z)}`)
                      const color = categoryMeta(g.id).color
                      return n === undefined ? (
                        <circle key={it.label + it.x} cx={px} cy={py} r={16} fill={color} stroke="#0b1210" strokeWidth={4}>
                          <title>{it.label}</title>
                        </circle>
                      ) : (
                        <g key={it.label + it.x}>
                          <circle cx={px} cy={py} r={30} fill={color} stroke="#0b1210" strokeWidth={6} />
                          <text x={px} y={py + 11} textAnchor="middle" fontSize={32} fontWeight={700} fill="#0b1210">
                            {n}
                          </text>
                          <title>{`${n}. ${it.label}`}</title>
                        </g>
                      )
                    })}
                  </g>
                ))}
            </svg>
          </div>

          <div className="flex flex-wrap gap-1.5 border-t border-edge p-2.5">
            <button
              onClick={() => setShowLine((v) => !v)}
              className="rounded-full border px-3 py-1.5 text-[11px]"
              style={{ borderColor: showLine ? 'var(--color-gold)' : 'var(--color-edge)', color: showLine ? 'var(--color-gold)' : 'var(--color-ink-mute)' }}
            >
              {t('companion.reportShowLine')}
            </button>
            <button
              onClick={() => setZoom((v) => !v)}
              className="rounded-full border px-3 py-1.5 text-[11px]"
              style={{ borderColor: zoom ? 'var(--color-gold)' : 'var(--color-edge)', color: zoom ? 'var(--color-gold)' : 'var(--color-ink-mute)' }}
            >
              {t('companion.reportZoom')}
            </button>
            {onLayer.map((g) => {
              const on = !hidden.has(g.id)
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
                  {g.label} <b className="font-mono">{g.items.length}</b>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {route.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 border-b border-edge pb-1.5 font-display text-sm">
            {t('route.title')} <span className="text-[11px] text-ink-faint">{t(`map.layers.${layer}`)} · {route.length}</span>
          </h3>
          <ol className="space-y-0.5 text-[13px]">
            {route.map((s, i) => (
              <li key={`${s.groupId}-${s.itemId}`} className="flex items-baseline gap-2 border-b border-edge/40 py-1">
                <span className="w-7 shrink-0 text-right font-mono text-[11px]" style={{ color: 'var(--color-gold)' }}>{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--color-gold)' }}>{regionOf(s.x, s.z)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {onLayer.map((g) => (
        <section key={g.id} className="mb-4">
          <h3 className="mb-2 border-b border-edge pb-1.5 font-display text-sm">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: categoryMeta(g.id).color }} />
            {g.label} <span className="text-[11px] text-ink-faint">{g.items.length}</span>
          </h3>
          <ul className="grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.label + it.x} className="flex items-baseline gap-2 py-0.5">
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                <span className="shrink-0 text-[11px]" style={{ color: 'var(--color-gold)' }}>{regionOf(it.x, it.z)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {lists.map((l) => (
        <section key={l.id} className="mb-4">
          <h3 className="mb-2 border-b border-edge pb-1.5 font-display text-sm">
            {l.label} <span className="text-[11px] text-ink-faint">{l.items.length}/{l.total}</span>
          </h3>
          <ul className="grid gap-x-6 gap-y-0.5 text-[13px] sm:grid-cols-2">
            {l.items.map((it) => (
              <li key={it.label} className="py-0.5">
                {it.label}
                {it.hint && <span className="text-ink-faint"> — {it.hint}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
