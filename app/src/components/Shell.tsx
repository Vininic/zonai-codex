import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

const NAV = [
  { to: '/', key: 'dashboard', icon: RingIcon },
  { to: '/tracker', key: 'tracker', icon: ListIcon },
  { to: '/inventory', key: 'inventory', icon: PouchIcon },
  { to: '/map', key: 'map', icon: MapIcon },
  { to: '/companion', key: 'companion', icon: EyeIcon },
  { to: '/save', key: 'save', icon: SaveIcon },
] as const

export function Shell() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const lang = useAppStore((s) => s.lang)
  const theme = useAppStore((s) => s.theme)
  const setLang = useAppStore((s) => s.setLang)
  const setTheme = useAppStore((s) => s.setTheme)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    i18n.changeLanguage(lang)
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en'
  }, [lang, i18n])

  const toggles = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setLang(lang === 'en' ? 'pt' : 'en')}
        className="panel px-2.5 py-1 font-mono text-xs uppercase text-ink-mute transition-colors hover:text-jade"
        aria-label="Language"
      >
        {lang === 'en' ? 'EN' : 'PT'}
      </button>
      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="panel px-2.5 py-1 font-mono text-xs text-ink-mute transition-colors hover:text-jade"
        aria-label="Theme"
      >
        {theme === 'dark' ? '☾' : '☀'}
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh lg:flex">
      {/* sidebar desktop (colapsável) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-edge bg-stone/60 transition-[width] duration-200 lg:flex ${collapsed ? 'w-16' : 'w-56'}`}
      >
        <div className={`flex items-center gap-2.5 pb-6 pt-6 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
          <img src="/icon.svg" alt="" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <span className="font-display text-lg leading-none">
              Zonai <span className="text-jade">Codex</span>
            </span>
          )}
        </div>
        <nav className={`flex flex-1 flex-col gap-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              title={t(`nav.${key}`)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-none py-2.5 text-sm transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                  isActive ? 'bg-stone-2 text-jade' : 'text-ink-mute hover:bg-stone-2/60 hover:text-ink'
                }`
              }
              style={({ isActive }) => (isActive ? { boxShadow: 'inset 2px 0 0 var(--color-jade)' } : undefined)}
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  {!collapsed && <span className="uppercase tracking-wider text-xs">{t(`nav.${key}`)}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className={`flex flex-col gap-3 pb-4 ${collapsed ? 'items-center px-0' : 'px-5'}`}>
          {!collapsed && toggles}
          <button
            onClick={toggleSidebar}
            className="panel px-2.5 py-1.5 font-mono text-xs text-ink-mute transition-colors hover:text-jade"
            aria-label="Collapse sidebar"
            title={collapsed ? '»' : '«'}
          >
            {collapsed ? '»' : '« '}
          </button>
        </div>
      </aside>

      <div className={`flex min-h-dvh w-full flex-col ${collapsed ? 'lg:pl-16' : 'lg:pl-56'}`}>
        {/* header mobile */}
        <header className="flex items-center justify-between px-4 pb-2 pt-4 lg:hidden">
          <h1 className="font-display text-xl text-ink">
            Zonai <span className="text-jade">Codex</span>
          </h1>
          {toggles}
        </header>

        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 pb-24 pt-2 lg:px-8 lg:pb-10 lg:pt-8">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      {/* bottom nav mobile */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-stone/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto flex max-w-3xl">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={key}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-wider transition-colors ${
                  isActive ? 'text-jade' : 'text-ink-faint hover:text-ink-mute'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  {t(`nav.${key}`)}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

type IconProps = { active: boolean }
const stroke = (active: boolean) => ({
  stroke: 'currentColor',
  strokeWidth: 1.6,
  fill: 'none',
  style: active ? { filter: 'drop-shadow(0 0 4px var(--color-jade))' } : undefined,
})

function RingIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
function ListIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h10" strokeLinecap="round" />
    </svg>
  )
}
function PouchIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M7 9V7a5 5 0 0 1 10 0v2" />
      <path d="M5.5 9h13l1 11.5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 20.5Z" />
    </svg>
  )
}
function MapIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
function EyeIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" strokeLinecap="round" />
    </svg>
  )
}
function SaveIcon({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" {...stroke(active)}>
      <path d="M5 4h11l3 3v13H5Z" />
      <path d="M8 4v5h7V4M8 20v-6h8v6" />
      {active && <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />}
    </svg>
  )
}
