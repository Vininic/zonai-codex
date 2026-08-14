import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { categoryMeta } from '../lib/categoryMeta'
import { useAppStore } from '../store/appStore'
import type { OptimizedRoute } from '../lib/routePlanner'

/**
 * Painel de rota — abre à direita do chat da Purah, como um artefato.
 * Desenha a rota otimizada por cima da imagem real da camada, com as pernas
 * (cada perna = um teleporte + a caminhada dele) separadas visualmente.
 *
 * A estrutura visual segue a referência de dashboard que o usuário passou —
 * tiles de número grande no topo, cards de nó em gradiente, ligações finas —
 * mas com a paleta do próprio app (jade/dourado sobre pedra) em vez do
 * azul/rosa da referência, pra não destoar do resto do Codex.
 */

/** mesma transformação do MapPage: dataset (x,z) → pixel da imagem 4096×3413 */
const W = 4096
const H = 3413
const toPx = (x: number, z: number): [number, number] => [((x + 6000) / 12000) * W, ((5000 - z) / 10000) * H]

/**
 * Enquadra a rota com uma folga, pra não desenhar o mapa inteiro à toa.
 * O recorte é quadrado (o quadro do painel é 1:1), mas nunca maior que a
 * imagem nem fora dela — senão uma rota que cruza Hyrule inteira gera uma
 * viewBox mais alta que o mapa e sobra faixa vazia embaixo.
 */
function viewBoxFor(points: [number, number][]): string {
  const maxSide = Math.min(W, H)
  if (!points.length) return `${(W - maxSide) / 2} 0 ${maxSide} ${maxSide}`
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = Math.max(320, Math.max(maxX - minX, maxY - minY) * 0.18)
  const side = Math.min(maxSide, Math.max(maxX - minX, maxY - minY) + pad * 2)
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(v, hi - side))
  const x = clamp((minX + maxX) / 2 - side / 2, W)
  const y = clamp((minY + maxY) / 2 - side / 2, H)
  return `${x} ${y} ${side} ${side}`
}

const km = (units: number) => `${(units / 1000).toFixed(1)} km`

export function RouteArtifact({
  route,
  title,
  onClose,
}: {
  route: OptimizedRoute
  title: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setRoute = useAppStore((s) => s.setRoute)
  const [hover, setHover] = useState<number | null>(null)

  const points = useMemo(() => route.stops.map((s) => toPx(s.x, s.z)), [route])
  const anchorPts = useMemo(
    () => route.legs.filter((l) => l.anchor).map((l) => toPx(l.anchor!.x, l.anchor!.z)),
    [route],
  )
  const viewBox = useMemo(() => viewBoxFor([...points, ...anchorPts]), [points, anchorPts])
  const scale = useMemo(() => parseFloat(viewBox.split(' ')[2]) / 520, [viewBox])

  return (
    <aside className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-edge px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-jade)', boxShadow: 'var(--glow-jade)' }} />
        <span className="min-w-0 flex-1 truncate font-display text-xs uppercase tracking-widest">{title}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase text-ink-faint">{t(`map.layers.${route.layer}`)}</span>
        <button onClick={onClose} className="shrink-0 px-1 text-ink-faint transition-colors hover:text-gloom" aria-label={t('common.close')}>
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* tiles de número grande */}
        <div className="grid grid-cols-3 divide-x divide-edge border-b border-edge">
          <Tile label={t('route.stops')} value={String(route.stops.length)} />
          <Tile label={t('route.walk')} value={km(route.totalWalk)} accent="var(--color-jade)" />
          <Tile label={t('route.warps')} value={String(route.legs.filter((l) => l.anchor).length)} accent="var(--color-gold)" />
        </div>

        {/* o que o teleporte economizou — sem isso, "6 km a pé" não diz nada */}
        {route.naiveWalk > route.totalWalk * 1.05 && (
          <p className="border-b border-edge px-3 py-2 text-[11px] leading-relaxed text-ink-mute">
            {t('route.saved', {
              percent: Math.round((1 - route.totalWalk / route.naiveWalk) * 100),
              naive: km(route.naiveWalk),
            })}
          </p>
        )}

        {/* o mapa com a rota traçada */}
        <div className="relative border-b border-edge bg-abyss">
          <svg viewBox={viewBox} className="block h-auto w-full" style={{ aspectRatio: '1 / 1' }} role="img" aria-label={title}>
            <image href={`/map/${route.layer}.webp`} x="0" y="0" width={W} height={H} opacity="0.75" />

            {/* uma polilinha tracejada por perna — pernas não se conectam a pé,
                o pulo entre elas é teleporte */}
            {route.legs.map((leg, li) => {
              const pts: [number, number][] = [
                ...(leg.anchor ? [toPx(leg.anchor.x, leg.anchor.z)] : []),
                ...leg.stops.map((s) => toPx(s.x, s.z)),
              ]
              if (pts.length < 2) return null
              return (
                <polyline
                  key={li}
                  points={pts.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke="var(--color-jade)"
                  strokeWidth={4 * scale}
                  strokeDasharray={`${10 * scale} ${8 * scale}`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.9"
                />
              )
            })}

            {/* âncoras de teleporte */}
            {route.legs.map((leg, li) => {
              if (!leg.anchor) return null
              const [cx, cy] = toPx(leg.anchor.x, leg.anchor.z)
              return (
                <g key={`a${li}`}>
                  <circle cx={cx} cy={cy} r={11 * scale} fill="var(--color-gold)" opacity="0.25" />
                  <circle cx={cx} cy={cy} r={5.5 * scale} fill="var(--color-gold)" />
                </g>
              )
            })}

            {/* paradas numeradas */}
            {route.stops.map((s, i) => {
              const [cx, cy] = toPx(s.x, s.z)
              const on = hover === i
              return (
                <g key={s.itemId} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={(on ? 13 : 9) * scale}
                    fill="var(--color-abyss)"
                    stroke={categoryMeta(s.groupId).color}
                    strokeWidth={2.5 * scale}
                  />
                  <text
                    x={cx}
                    y={cy + 4 * scale}
                    textAnchor="middle"
                    fontSize={10 * scale}
                    fill={categoryMeta(s.groupId).color}
                    fontFamily="var(--font-mono)"
                  >
                    {i + 1}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* pernas */}
        <ol className="space-y-2 p-3">
          {route.legs.map((leg, li) => {
            const offset = route.legs.slice(0, li).reduce((n, l) => n + l.stops.length, 0)
            return (
              <li key={li} className="space-y-1">
                <div
                  className="flex items-center gap-2 px-2.5 py-1.5"
                  style={{
                    background: leg.anchor
                      ? 'linear-gradient(90deg, color-mix(in srgb, var(--color-gold) 22%, transparent), transparent)'
                      : 'linear-gradient(90deg, color-mix(in srgb, var(--color-jade) 22%, transparent), transparent)',
                    borderLeft: `2px solid ${leg.anchor ? 'var(--color-gold)' : 'var(--color-jade)'}`,
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {leg.anchor ? (
                      <>
                        <span className="text-ink-faint">{t('route.warpTo')} </span>
                        {leg.anchor.label}
                      </>
                    ) : (
                      t('route.onFoot')
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-faint">{km(leg.walk)}</span>
                </div>
                <ul className="space-y-0.5 pl-3">
                  {leg.stops.map((s, i) => {
                    const n = offset + i
                    return (
                      <li
                        key={s.itemId}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(null)}
                        className="flex items-center gap-2 px-1 py-0.5 text-[11px] transition-colors"
                        style={{ background: hover === n ? 'var(--color-stone-2)' : undefined }}
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full font-mono text-[9px]"
                          style={{ background: categoryMeta(s.groupId).color, color: 'var(--color-abyss)' }}
                        >
                          {n + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-ink-mute">{s.label}</span>
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
        </ol>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-edge px-3 py-2">
        <button
          onClick={() => {
            setRoute(route.stops)
            navigate('/map')
          }}
          className="btn-jade !px-3 !py-1.5 !text-xs"
        >
          {t('route.openFullMap')}
        </button>
        {route.pendingTotal > route.stops.length && (
          <span className="font-mono text-[10px] text-ink-faint">
            {t('route.more', { count: route.pendingTotal - route.stops.length })}
          </span>
        )}
      </footer>
    </aside>
  )
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="font-display text-xl leading-none" style={{ color: accent ?? 'var(--color-ink)' }}>
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-widest text-ink-faint">{label}</div>
    </div>
  )
}
