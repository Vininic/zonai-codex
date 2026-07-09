import { categoryMeta } from '../../lib/categoryMeta'

export interface RadialLayerDatum {
  id: string
  name: string
  done: number
  total: number
}

/**
 * Gráfico radial multi-camada: um anel concêntrico por grupo, arco = fração
 * concluída, cor da categoria. Legenda ao lado com contagens.
 */
export function RadialLayers({ data, size = 220 }: { data: RadialLayerDatum[]; size?: number }) {
  const rings = data.slice(0, 7)
  const cx = 100
  const cy = 100
  const r0 = 88
  const step = Math.min(11, (r0 - 24) / Math.max(rings.length, 1))

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-5">
      <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="progress by category">
        {rings.map((d, i) => {
          const r = r0 - i * step
          const c = 2 * Math.PI * r
          const frac = d.total ? d.done / d.total : 0
          const color = categoryMeta(d.id).color
          return (
            <g key={d.id}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-stone-2)" strokeWidth={step * 0.62} />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={step * 0.62}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - Math.max(0.005, frac))}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 800ms ease', filter: `drop-shadow(0 0 2px ${color})` }}
              />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r={3.5} fill="var(--color-jade)" style={{ filter: 'drop-shadow(0 0 5px var(--color-jade))' }} />
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {rings.map((d) => {
          const color = categoryMeta(d.id).color
          const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
          return (
            <li key={d.id} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
              <span className="min-w-0 flex-1 truncate text-ink-mute">{d.name}</span>
              <span className="shrink-0 font-mono text-ink">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
