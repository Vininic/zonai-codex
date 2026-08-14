import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { itemLabel } from '../lib/itemLabel'
import { categoryMeta, ICON_MARKER_MAX_ITEMS } from '../lib/categoryMeta'
import { useAppStore } from '../store/appStore'
import type { Category, CategoryItem } from '../lib/dataset'

/** imagem 4096×3413 gerada de 6000×5000 (scripts/prepare-map-images.mjs) */
const W = 4096
const H = 3413
const LAYERS = ['surface', 'sky', 'depths'] as const
type MapLayer = (typeof LAYERS)[number]

/** dataset: x ∈ [−6000, 6000], z ∈ [−5000, 5000] com +z = norte */
function toLatLng(x: number, z: number): [number, number] {
  const px = ((x + 6000) / 12000) * W
  const pyFromTop = ((5000 - z) / 10000) * H
  return [H - pyFromTop, px]
}

const iconCache = new Map<string, L.Icon>()
function categoryIcon(url: string, done: boolean): L.Icon {
  const key = `${url}|${done}`
  let icon = iconCache.get(key)
  if (!icon) {
    icon = L.icon({ iconUrl: url, iconSize: [22, 22], iconAnchor: [11, 11], className: done ? 'marker-done' : 'marker-pending' })
    iconCache.set(key, icon)
  }
  return icon
}

export function MapPage() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const route = useAppStore((s) => s.route)
  const player = useAppStore((s) => s.player)
  const collapsed = useAppStore((s) => s.sidebarCollapsed)

  const [layer, setLayer] = useState<MapLayer>('surface')
  const [hideDone, setHideDone] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(data.categories.filter((c) => c.defaultVisible).map((c) => c.id)),
  )

  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.ImageOverlay | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const routeRef = useRef<L.LayerGroup | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const groupName = (id: string, fallback: string) => {
    const key = `groups.${id}`
    const translated = t(key)
    return translated === key ? fallback : translated
  }

  const isDone = useMemo(() => {
    return (catId: string, itemId: string) => !!(manual[catId]?.[itemId] || fromSave[catId]?.[itemId])
  }, [manual, fromSave])

  // pendências por categoria na camada atual (pro painel/legenda)
  const pendingByCat = useMemo(() => {
    const out = new Map<string, { pending: number; layerTotal: number }>()
    for (const cat of data.categories) {
      let pending = 0
      let layerTotal = 0
      for (const item of cat.items) {
        if ((item.layer ?? 'surface') !== layer) continue
        layerTotal++
        if (!isDone(cat.id, item.id)) pending++
      }
      out.set(cat.id, { pending, layerTotal })
    }
    return out
  }, [data, layer, isDone])

  // init do mapa (uma vez)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      crs: L.CRS.Simple,
      minZoom: -3.5,
      maxZoom: 2,
      zoomSnap: 0.25,
      zoomControl: false,
      attributionControl: false,
      renderer: L.canvas({ padding: 0.4 }),
    })
    map.fitBounds([
      [0, 0],
      [H, W],
    ])
    L.control.zoom({ position: 'topright' }).addTo(map)
    mapRef.current = map
    markersRef.current = L.layerGroup().addTo(map)
    routeRef.current = L.layerGroup().addTo(map)
    if (import.meta.env.DEV) (window as unknown as { __map?: L.Map }).__map = map
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
      markersRef.current = null
      routeRef.current = null
    }
  }, [])

  // troca da imagem de camada
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    overlayRef.current?.remove()
    overlayRef.current = L.imageOverlay(`/map/${layer}.webp`, [
      [0, 0],
      [H, W],
    ]).addTo(map)
  }, [layer])

  // markers
  useEffect(() => {
    const map = mapRef.current
    const group = markersRef.current
    if (!map || !group) return
    group.clearLayers()

    for (const cat of data.categories) {
      if (!visible.has(cat.id)) continue
      const meta = categoryMeta(cat.id)
      const useIcon = !!meta.icon && cat.items.length <= ICON_MARKER_MAX_ITEMS
      for (const item of cat.items) {
        const itemLayer = item.layer ?? 'surface'
        if (itemLayer !== layer) continue
        const done = isDone(cat.id, item.id)
        if (hideDone && done) continue

        const marker = useIcon
          ? L.marker(toLatLng(item.x, item.z), { icon: categoryIcon(meta.icon!, done) })
          : L.circleMarker(toLatLng(item.x, item.z), {
              radius: done ? 4 : 4.5,
              color: done ? 'transparent' : meta.color,
              weight: 1.5,
              fillColor: done ? meta.color : '#0b1210',
              fillOpacity: done ? 0.4 : 0.8,
            })
        marker.bindPopup(() =>
          buildPopup(cat, item, groupName(cat.id, cat.label), {
            fromSave: !!fromSave[cat.id]?.[item.id],
            manual: !!manual[cat.id]?.[item.id],
            markDone: t('map.markDone'),
            markUndone: t('map.markUndone'),
            fromSaveLabel: t('save.detected'),
          }),
        )
        group.addLayer(marker)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, layer, visible, hideDone, isDone])

  // rota da companion + posição do player
  useEffect(() => {
    const map = mapRef.current
    const group = routeRef.current
    if (!map || !group) return
    group.clearLayers()

    if (player?.position && player.position.layer === layer) {
      L.circleMarker(toLatLng(player.position.x, player.position.z), {
        radius: 7,
        color: '#d9b96a',
        weight: 2,
        fillColor: '#d9b96a',
        fillOpacity: 0.5,
      })
        .bindTooltip('Link')
        .addTo(group)
    }

    const steps = (route ?? []).filter((s) => s.layer === layer)
    if (steps.length === 0) return

    // a rota é quebrada em trechos: `legStart` marca uma parada alcançada por
    // teleporte, então ligar ela à anterior desenharia uma caminhada que não
    // existe. Cada trecho vira uma polilinha própria.
    const segments: [number, number][][] = []
    let current: [number, number][] = []
    if (player?.position && player.position.layer === layer) {
      current.push(toLatLng(player.position.x, player.position.z))
    }
    for (const s of steps) {
      if (s.legStart && current.length) {
        segments.push(current)
        current = []
      }
      current.push(toLatLng(s.x, s.z))
    }
    if (current.length) segments.push(current)

    for (const seg of segments) {
      if (seg.length < 2) continue
      L.polyline(seg, { color: '#d9b96a', weight: 2, dashArray: '6 6', opacity: 0.9 }).addTo(group)
    }
    const latlngs = steps.map((s) => toLatLng(s.x, s.z))
    steps.forEach((s, i) => {
      L.marker(toLatLng(s.x, s.z), {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;border-radius:50%;background:#d9b96a;color:#0b1210;font:600 11px/20px var(--font-mono);text-align:center;box-shadow:0 0 8px rgba(217,185,106,.6)">${i + 1}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      })
        .bindTooltip(s.label)
        .addTo(group)
    })
    map.fitBounds(L.latLngBounds(latlngs).pad(0.2))
  }, [route, player, layer])

  // sidebar recolhe/expande → leaflet precisa remedir o container
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 250)
    return () => clearTimeout(id)
  }, [collapsed])

  const toggleCat = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={`fixed inset-0 z-30 ${collapsed ? 'lg:left-16' : 'lg:left-56'}`}>
      <div ref={containerRef} className="h-full w-full" style={{ background: 'var(--color-abyss)' }} />

      {/* controles topo: botão de filtros/legenda + esconder feitos */}
      <div className="absolute left-3 top-3 z-[1000] flex gap-2">
        <button onClick={() => setPanelOpen((v) => !v)} className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide" style={chipStyle(panelOpen)}>
          ☰ {t('map.legend')}
        </button>
        <button onClick={() => setHideDone((v) => !v)} className="px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide" style={chipStyle(hideDone)}>
          {t('map.hideDone')}
        </button>
      </div>

      {/* painel filtro+legenda */}
      {panelOpen && (
        <div className="panel-in absolute bottom-32 left-3 top-14 z-[1000] w-64 overflow-y-auto border border-edge bg-stone/95 p-3 backdrop-blur-sm lg:bottom-14">
          <div className="mb-2 flex gap-1.5">
            <button
              onClick={() => setVisible(new Set(data.categories.map((c) => c.id)))}
              className="flex-1 border border-edge px-2 py-1 text-[10px] uppercase text-ink-mute hover:text-jade"
            >
              {t('map.all')}
            </button>
            <button
              onClick={() => setVisible(new Set())}
              className="flex-1 border border-edge px-2 py-1 text-[10px] uppercase text-ink-mute hover:text-jade"
            >
              {t('map.none')}
            </button>
          </div>
          {data.categories.map((c) => {
            const meta = categoryMeta(c.id)
            const info = pendingByCat.get(c.id)
            if (!info || info.layerTotal === 0) return null
            const on = visible.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className="flex w-full items-center gap-2 px-1.5 py-1.5 text-left text-xs transition-colors hover:bg-stone-2"
                style={{ opacity: on ? 1 : 0.45 }}
              >
                {meta.icon ? (
                  <img src={meta.icon} alt="" className="h-4 w-4 object-contain" />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                )}
                <span className="min-w-0 flex-1 truncate" style={{ color: on ? 'var(--color-ink)' : 'var(--color-ink-mute)' }}>
                  {groupName(c.id, c.label)}
                </span>
                <span className="font-mono text-[10px]" style={{ color: info.pending > 0 ? meta.color : 'var(--color-gold)' }}>
                  {info.pending > 0 ? info.pending : '✓'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* switch de camada */}
      <div className="absolute bottom-20 left-3 z-[999] flex gap-1 lg:bottom-4 lg:flex-col">
        {LAYERS.map((l) => (
          <button
            key={l}
            onClick={() => setLayer(l)}
            className="px-2.5 py-1.5 font-display text-[11px] uppercase tracking-widest"
            style={chipStyle(layer === l)}
          >
            {t(`map.layers.${l}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--color-jade)' : 'color-mix(in srgb, var(--color-stone) 88%, transparent)',
    color: active ? 'var(--color-abyss)' : 'var(--color-ink-mute)',
    border: '1px solid var(--color-edge)',
    clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
    boxShadow: active ? 'var(--glow-jade)' : undefined,
  }
}

function buildPopup(
  cat: Category,
  item: CategoryItem,
  catName: string,
  opts: { fromSave: boolean; manual: boolean; markDone: string; markUndone: string; fromSaveLabel: string },
): HTMLElement {
  const el = document.createElement('div')
  el.style.fontFamily = 'var(--font-sans)'
  el.style.minWidth = '160px'

  const done = opts.fromSave || opts.manual
  const title = document.createElement('div')
  title.textContent = itemLabel(item)
  title.style.fontWeight = '600'
  title.style.marginBottom = '2px'
  el.appendChild(title)

  const sub = document.createElement('div')
  sub.textContent = `${catName}${done ? ' ✓' : ''}`
  sub.style.cssText = 'font-size:11px;opacity:0.7;margin-bottom:8px'
  el.appendChild(sub)

  if (opts.fromSave) {
    // confirmado pelo save: não é des/marcável no tracker (§3.5 do plano)
    const tag = document.createElement('div')
    tag.textContent = `✓ ${opts.fromSaveLabel}`
    tag.style.cssText = 'font-size:11px;color:var(--color-jade)'
    el.appendChild(tag)
    return el
  }

  const btn = document.createElement('button')
  let manual = opts.manual
  const paint = () => {
    btn.textContent = manual ? opts.markUndone : opts.markDone
    btn.style.cssText = `font-size:12px;padding:4px 10px;cursor:pointer;border:1px solid var(--color-edge);background:${manual ? 'transparent' : 'var(--color-jade)'};color:${manual ? 'inherit' : '#0b1210'}`
    sub.textContent = `${catName}${manual ? ' ✓' : ''}`
  }
  paint()
  btn.onclick = () => {
    useAppStore.getState().toggleManual(cat.id, item.id)
    manual = !manual
    paint()
  }
  el.appendChild(btn)
  return el
}
