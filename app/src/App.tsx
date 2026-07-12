import { lazy, Suspense, useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { loadDataset, type CompletionData } from './lib/dataset'
import { DatasetContext } from './lib/useDataset'
import { Shell } from './components/Shell'
import { LoadingRing } from './components/LoadingRing'
import { Dashboard } from './pages/Dashboard'
import { Tracker } from './pages/Tracker'
import { Category } from './pages/Category'
import { Inventory } from './pages/Inventory'
import { SavePage } from './pages/SavePage'
import { NotFound } from './pages/NotFound'

// Leaflet (mapa) e a lógica de IA da Companion são os maiores contribuintes
// do bundle — lazy-load pra manter o carregamento inicial leve no mobile.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })))
const Companion = lazy(() => import('./pages/Companion').then((m) => ({ default: m.Companion })))

export default function App() {
  const [data, setData] = useState<CompletionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDataset().then(setData).catch((e) => setError(String(e)))
  }, [])

  if (error) {
    return <div className="flex min-h-dvh items-center justify-center p-6 text-sm" style={{ color: 'var(--color-gloom)' }}>{error}</div>
  }
  if (!data) {
    return <LoadingRing />
  }

  return (
    <DatasetContext.Provider value={data}>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="tracker" element={<Tracker />} />
            <Route path="tracker/:groupId" element={<Category />} />
            <Route path="inventory" element={<Inventory />} />
            <Route
              path="map"
              element={
                <Suspense fallback={<LoadingRing className="flex min-h-[50vh] items-center justify-center" />}>
                  <MapPage />
                </Suspense>
              }
            />
            <Route
              path="companion"
              element={
                <Suspense fallback={<LoadingRing className="flex min-h-[50vh] items-center justify-center" />}>
                  <Companion />
                </Suspense>
              }
            />
            <Route path="save" element={<SavePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </DatasetContext.Provider>
  )
}
