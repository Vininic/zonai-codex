import type { ReactNode } from 'react'

export interface FlowStepDef {
  title: ReactNode
  color?: string
  children?: ReactNode
}

/**
 * Flow chart vertical dos planos da Purah: nós numerados conectados por
 * linha, conteúdo em card por passo.
 */
export function PlanFlow({ steps }: { steps: FlowStepDef[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const color = step.color ?? 'var(--color-jade)'
        const last = i === steps.length - 1
        return (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
            {/* trilho: nó + conector */}
            <div className="flex w-6 shrink-0 flex-col items-center">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                style={{ background: color, color: 'var(--color-abyss)', boxShadow: `0 0 8px ${color}66` }}
              >
                {i + 1}
              </span>
              {!last && <span className="mt-1 w-px flex-1" style={{ background: 'linear-gradient(var(--color-edge-lit), var(--color-edge))' }} />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex min-h-6 items-center text-sm font-medium">{step.title}</div>
              {step.children && <div className="mt-1.5">{step.children}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
