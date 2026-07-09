import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTranslation } from 'react-i18next'
import { useDataset } from '../lib/useDataset'
import { itemLabel } from '../lib/itemLabel'
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

export function MapPage() {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)

  const [layer, setLayer] = useState<MapLayer>('surface')
  const [hideDone, setHideDone] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set(data.categories.filter((c) => c.defaultVisible).map((c) => c.id)),
  )

  const route = useAppStore((s) => s.route)
  const player = useAppStore((s) => s.player)

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
    L.control.zoom({ position: 'bottomright' }).addTo(map)
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
      for (const item of cat.items) {
        const itemLayer = item.layer ?? 'surface'
        if (itemLayer !== layer) continue
        const done = isDone(cat.id, item.id)
        if (hideDone && done) continue
        const marker = L.circleMarker(toLatLng(item.x, item.z), {
          radius: done ? 4.5 : 5,
          color: done ? 'transparent' : '#57e6c0',
          weight: 1.5,
          fillColor: done ? '#2e8c76' : '#0b1210',
          fillOpacity: done ? 0.85 : 0.75,
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
    const latlngs = steps.map((s) => toLatLng(s.x, s.z))
    if (player?.position && player.position.layer === layer) {
      latlngs.unshift(toLatLng(player.position.x, player.position.z))
    }
    L.polyline(latlngs, { color: '#d9b96a', weight: 2, dashArray: '6 6', opacity: 0.9 }).addTo(group)
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
    // enquadra a rota ao chegar do Companion
    map.fitBounds(L.latLngBounds(latlngs).pad(0.2))
  }, [route, player, layer])

  const toggleCat = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="relative -mx-4" style={{ height: 'calc(100dvh - 148px)' }}>
      <div ref={containerRef} className="h-full w-full" style={{ background: 'var(--color-abyss)' }} />

      {/* chips de categoria */}
      <div className="absolute inset-x-0 top-0 z-[1000] flex gap-1.5 overflow-x-auto px-3 py-2" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setHideDone((v) => !v)}
          className="shrink-0 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide"
          style={chipStyle(hideDone)}
        >
          {t('map.hideDone')}
        </button>
        {data.categories.map((c) => (
          <button
            key={c.id}
            onClick={() => toggleCat(c.id)}
            className="shrink-0 px-2.5 py-1 text-[11px]"
            style={chipStyle(visible.has(c.id))}
          >
            {groupName(c.id, c.label)}
          </button>
        ))}
      </div>

      {/* switch de camada */}
      <div className="absolute bottom-4 left-3 z-[1000] flex flex-col gap-1">
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
