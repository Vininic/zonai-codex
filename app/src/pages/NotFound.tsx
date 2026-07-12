import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <svg width="64" height="64" viewBox="0 0 100 100" fill="none" stroke="var(--color-edge-lit)" strokeWidth="2" aria-hidden>
        <circle cx="50" cy="50" r="40" strokeDasharray="4 7" />
        <path d="M38 38 L62 62 M62 38 L38 62" stroke="var(--color-gloom)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h2 className="font-display text-lg">{t('notFound.title')}</h2>
      <p className="max-w-sm text-sm text-ink-mute">{t('notFound.body')}</p>
      <Link to="/" className="btn-jade">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
