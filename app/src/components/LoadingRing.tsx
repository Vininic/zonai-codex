export function LoadingRing({ className = 'flex min-h-dvh items-center justify-center' }: { className?: string }) {
  return (
    <div className={className}>
      <svg width="56" height="56" viewBox="0 0 100 100" fill="none" stroke="var(--color-jade)" strokeWidth="2" aria-label="Loading">
        <circle cx="50" cy="50" r="40" strokeDasharray="60 191" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1.2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  )
}
