interface ZonaiRingProps {
  fraction: number
  size?: number
  /** texto central (default: percentual) */
  value?: string
  sublabel?: string
}

/**
 * Anel de progresso Zonai: anel externo de ticks (runa), arco de progresso
 * jade com glow; vira dourado ao atingir 100%.
 */
export function ZonaiRing({ fraction, size = 200, value, sublabel }: ZonaiRingProps) {
  const complete = fraction >= 1
  const color = complete ? 'var(--color-gold)' : 'var(--color-jade)'
  const r = 42
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, fraction))
  const display = value ?? `${(pct * 100).toFixed(pct >= 0.999 && pct < 1 ? 1 : pct >= 0.1 ? 1 : 2)}%`

  // ticks e glow só nos anéis grandes — dezenas de anéis pequenos com
  // drop-shadow deixam a composição da página lenta demais no mobile
  const detailed = size >= 100
  const ticks = []
  for (let i = 0; detailed && i < 60; i++) {
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2
    const lit = i / 60 <= pct && pct > 0
    ticks.push(
      <line
        key={i}
        x1={50 + 48 * Math.cos(angle)}
        y1={50 + 48 * Math.sin(angle)}
        x2={50 + (i % 5 === 0 ? 44.5 : 46) * Math.cos(angle)}
        y2={50 + (i % 5 === 0 ? 44.5 : 46) * Math.sin(angle)}
        stroke={lit ? color : 'var(--color-edge)'}
        strokeWidth={i % 5 === 0 ? 1.1 : 0.6}
      />,
    )
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={display}>
        {ticks}
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-edge)" strokeWidth="1.4" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          transform="rotate(-90 50 50)"
          style={{ filter: detailed && pct > 0 ? `drop-shadow(0 0 3px ${color})` : undefined, transition: 'stroke-dashoffset 600ms ease' }}
        />
        {/* núcleo Zonai: círculo interno + ponto */}
        {detailed && <circle cx="50" cy="50" r={34} fill="none" stroke="var(--color-edge)" strokeWidth="0.5" opacity="0.7" />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-display leading-none"
          style={{ fontSize: size * 0.17, color: complete ? 'var(--color-gold)' : 'var(--color-ink)' }}
        >
          {display}
        </span>
        {sublabel && (
          <span className="mt-1 uppercase tracking-widest text-ink-mute" style={{ fontSize: Math.max(9, size * 0.05) }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}
