import { useTranslation } from 'react-i18next'

function ComingSoon({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-4 pt-14 text-center">
      {/* runa Zonai ornamental */}
      <svg width="88" height="88" viewBox="0 0 100 100" fill="none" stroke="var(--color-edge-lit)" strokeWidth="1.5" aria-hidden>
        <circle cx="50" cy="50" r="44" strokeDasharray="4 6" />
        <circle cx="50" cy="50" r="30" />
        <circle cx="50" cy="50" r="5" fill="var(--color-jade)" stroke="none" style={{ filter: 'drop-shadow(0 0 6px var(--color-jade))' }} />
        <path d="M50 6v14M50 80v14M6 50h14M80 50h14" strokeLinecap="round" />
      </svg>
      <h2 className="mt-5 font-display text-lg">{t(titleKey)}</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-mute">{t(bodyKey)}</p>
    </div>
  )
}

export function Companion() {
  return <ComingSoon titleKey="companion.title" bodyKey="companion.soon" />
}
