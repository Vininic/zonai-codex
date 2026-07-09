export interface DonutDatum {
  id: string
  name: string
  value: number
  total?: number
  color: string
}

/**
 * Donut com legenda em tabela (label | valor | %), estilo dashboard:
 * segmentos = participação de cada grupo no total.
 */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  size = 150,
}: {
  data: DonutDatum[]
  centerLabel: string
  centerValue: string
  size?: number
}) {
  const sum = data.reduce((a, d) => a + d.value, 0) || 1
  const r = 40
  const c = 2 * Math.PI * r
  let acc = 0

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-stone-2)" strokeWidth="10" />
          {data.map((d) => {
            const frac = d.value / sum
            const offset = acc
            acc += frac
            return (
              <circle
                key={d.id}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="10"
                strokeDasharray={`${Math.max(frac * c - 1.5, 0.001)} ${c}`}
                strokeDashoffset={-offset * c}
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 700ms ease' }}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] uppercase tracking-widest text-ink-faint">{centerLabel}</span>
          <span className="font-display text-xl">{centerValue}</span>
        </div>
      </div>
      <table className="w-full min-w-0 flex-1 table-fixed text-xs">
        <tbody>
          {data.map((d) => {
            const pct = d.total ? Math.round((d.value / d.total) * 100) : Math.round((d.value / sum) * 100)
            return (
              <tr key={d.id} className="border-b border-edge/50 last:border-0">
                <td className="py-1.5 pr-2 text-ink-mute">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 5px ${d.color}` }} />
                    <span className="truncate">{d.name}</span>
                  </div>
                </td>
                <td className="w-20 py-1.5 pr-2 text-right font-mono text-ink">
                  {d.value}
                  {d.total !== undefined && <span className="text-ink-faint">/{d.total}</span>}
                </td>
                <td className="w-11 py-1.5 text-right font-mono text-ink-faint">{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
