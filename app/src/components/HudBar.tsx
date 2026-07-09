import { useTranslation } from 'react-i18next'
import type { PlayerStats } from '../lib/saveParser'

/** faixa de status estilo HUD do jogo: corações, stamina, bateria, rupees */
export function HudBar({ player }: { player: PlayerStats }) {
  const { t } = useTranslation()
  const cells: { key: string; label: string; value: string; max?: string; color: string }[] = [
    { key: 'hearts', label: t('hud.hearts'), value: `${player.hearts}`, max: `${player.maxHearts}`, color: 'var(--color-gloom)' },
    { key: 'stamina', label: t('hud.stamina'), value: `${round1(player.staminaWheels)}`, max: `${player.maxStaminaWheels}`, color: 'var(--color-jade)' },
    { key: 'battery', label: t('hud.battery'), value: `${round1(player.batteryCells)}`, max: `${player.maxBatteryCells}`, color: 'var(--color-jade)' },
    { key: 'rupees', label: t('hud.rupees'), value: player.rupees.toLocaleString(), color: 'var(--color-gold)' },
  ]
  return (
    <div className="panel grid grid-cols-4 divide-x divide-edge">
      {cells.map((c) => (
        <div key={c.key} className="flex flex-col items-center gap-0.5 px-2 py-2.5">
          <span className="font-mono text-sm font-medium" style={{ color: c.color }}>
            {c.value}
            {c.max && <span className="text-ink-faint">/{c.max}</span>}
          </span>
          <span className="text-[10px] uppercase tracking-widest text-ink-mute">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
