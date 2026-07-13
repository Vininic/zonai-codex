import type { MaterialBucket } from '../lib/materialIcon'

export type IconKind = MaterialBucket | 'key' | 'fabric' | 'armor'

const common = {
  stroke: 'currentColor',
  strokeWidth: 1.6,
  fill: 'none',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** ícone de "tipo" pros cards do Inventário — não há ícone por item no dataset. */
export function TypeIcon({ kind, size = 22 }: { kind: IconKind; size?: number }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', ...common }
  switch (kind) {
    case 'fruit':
      return (
        <svg {...props}>
          <path d="M12 9c-3.5 0-6 2.4-6 6.2C6 18.5 8.5 21 11 21c.6 0 1-.3 1-.3s.4.3 1 .3c2.5 0 5-2.5 5-5.8C18 11.4 15.5 9 12 9Z" />
          <path d="M12 9c0-2 .8-3.3 2.2-4.2M12 9c0-1.6-.6-2.7-1.8-3.5" />
        </svg>
      )
    case 'mushroom':
      return (
        <svg {...props}>
          <path d="M4 11c0-4 3.6-7 8-7s8 3 8 7c0 1-1 1.4-2 1.2-1.8-.4-3.5.8-3.5 2.3V19a2.5 2.5 0 0 1-5 0v-4.5c0-1.5-1.7-2.7-3.5-2.3-1 .2-2-.2-2-1.2Z" />
          <circle cx="9" cy="8.5" r=".6" fill="currentColor" stroke="none" />
          <circle cx="14.5" cy="7.5" r=".6" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'plant':
      return (
        <svg {...props}>
          <path d="M12 21V10" />
          <path d="M12 13c0-3.5-2.5-6-6.5-6 0 3.8 2.7 6.5 6.5 6.5Z" />
          <path d="M12 10c0-3.8 2.8-6.5 7-6.8-.2 4-3.2 6.8-7 6.8Z" />
        </svg>
      )
    case 'meat':
      return (
        <svg {...props}>
          <path d="M9 15c-2-2-2.3-5.3-.3-7.7 2.2-2.6 6-2.8 8.3-.5s2.1 6.1-.5 8.3c-1.2 1-2.7 1.4-4.1 1.2" />
          <path d="M9 15c-1.6 1.2-3 2.7-4.3 4.2-.6.7.4 1.7 1.1 1.1C7.3 19 8.8 17.6 10 16" />
          <circle cx="13.5" cy="9.5" r="1.1" />
        </svg>
      )
    case 'fish':
      return (
        <svg {...props}>
          <path d="M3 12c3-3.5 7-5 11-5 3 0 5.5 2.2 7 5-1.5 2.8-4 5-7 5-4 0-8-1.5-11-5Z" />
          <path d="M15 9.5 17.5 6M15 14.5 17.5 18" />
          <circle cx="8" cy="11.3" r=".7" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'insect':
      return (
        <svg {...props}>
          <ellipse cx="12" cy="13" rx="3.4" ry="5.2" />
          <path d="M12 8.5V6M9.5 6.5 8 4.5M14.5 6.5 16 4.5" />
          <path d="M8.7 11h-3M8.7 14h-3M8.7 17h-3M15.3 11h3M15.3 14h3M15.3 17h3" />
        </svg>
      )
    case 'ore':
      return (
        <svg {...props}>
          <path d="M12 3 20 9l-3 12H7L4 9Z" />
          <path d="M12 3v6M4 9h16M9 9l-1.5 12M15 9l1.5 12" />
        </svg>
      )
    case 'monster':
      return (
        <svg {...props}>
          <path d="M6 4c2 3 2 6 0 9M18 4c-2 3-2 6 0 9" />
          <path d="M7 12c0-3 2.2-5 5-5s5 2 5 5c0 4-2 8-5 9-3-1-5-5-5-9Z" />
          <path d="M10 11l.8 2M14 11l-.8 2" />
        </svg>
      )
    case 'zonai':
      return (
        <svg {...props}>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'key':
      return (
        <svg {...props}>
          <circle cx="8" cy="12" r="4" />
          <path d="M11.5 12H21M17 12v3.5M20 12v2.5" />
        </svg>
      )
    case 'fabric':
      return (
        <svg {...props}>
          <path d="M5 5h14v4c0 1.5-1.5 2-3 1.5V19H8v-8.5C6.5 11 5 10.5 5 9Z" />
          <path d="M9 12.5h6" />
        </svg>
      )
    case 'armor':
      return (
        <svg {...props}>
          <path d="M12 3c2.5 1.6 4.8 2.2 7 2.2 0 8.5-3.3 13-7 15.3-3.7-2.3-7-6.8-7-15.3 2.2 0 4.5-.6 7-2.2Z" />
          <path d="M12 8v8" />
        </svg>
      )
    case 'misc':
    default:
      return (
        <svg {...props}>
          <path d="M9 3h6l-.6 3.4a4 4 0 0 1 3.6 4V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8.6a4 4 0 0 1 3.6-4Z" />
          <path d="M8.5 12.5h7" />
        </svg>
      )
  }
}
