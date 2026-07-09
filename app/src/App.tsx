import { useEffect, useState } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { loadDataset, type CompletionData } from './lib/dataset'
import { DatasetContext } from './lib/useDataset'
import { Shell } from './components/Shell'
import { Dashboard } from './pages/Dashboard'
import { Tracker } from './pages/Tracker'
import { Category } from './pages/Category'
import { Companion } from './pages/Placeholders'
import { MapPage } from './pages/MapPage'
import { SavePage } from './pages/SavePage'

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
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <svg width="56" height="56" viewBox="0 0 100 100" fill="none" stroke="var(--color-jade)" strokeWidth="2" aria-label="Loading">
          <circle cx="50" cy="50" r="40" strokeDasharray="60 191" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    )
  }

  return (
    <DatasetContext.Provider value={data}>
      <HashRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Dashboard />} />
            <Route path="tracker" element={<Tracker />} />
            <Route path="tracker/:groupId" element={<Category />} />
            <Route path="map" element={<MapPage />} />
            <Route path="companion" element={<Companion />} />
            <Route path="save" element={<SavePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </DatasetContext.Provider>
  )
}
