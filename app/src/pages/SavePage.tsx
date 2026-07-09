import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseSave, SaveParseError } from '../lib/saveParser'
import { evaluateSave } from '../lib/completion'
import { computeImportDiff } from '../lib/importDiff'
import { useDataset } from '../lib/useDataset'
import { DiffView } from '../components/DiffView'
import { useAppStore, type Progress } from '../store/appStore'

export function SavePage() {
  const { t } = useTranslation()
  const data = useDataset()
  const setSaveResult = useAppStore((s) => s.setSaveResult)
  const clearSave = useAppStore((s) => s.clearSave)
  const saveMeta = useAppStore((s) => s.saveMeta)
  const fromSave = useAppStore((s) => s.fromSave)
  const lastDiff = useAppStore((s) => s.lastDiff)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function importBuffer(buffer: ArrayBuffer, fileName: string) {
    setError(null)
    setBusy(true)
    try {
      const parsed = parseSave(buffer)
      const evaluated = evaluateSave(data, parsed)
      const progress: Progress = {}
      for (const [groupId, ids] of evaluated) {
        const set: Record<string, 1> = {}
        for (const id of ids) set[id] = 1
        progress[groupId] = set
      }
      // diff só faz sentido sobrepondo um save já carregado
      const prev = useAppStore.getState()
      const diff = prev.saveMeta
        ? computeImportDiff(prev.fromSave, progress, prev.player, parsed.player, prev.saveMeta.fileName, fileName)
        : null
      setSaveResult(progress, parsed.player, {
        version: parsed.version,
        fileName,
        importedAt: new Date().toISOString(),
      }, diff)
    } catch (e) {
      setError(e instanceof SaveParseError ? t('save.invalid') : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onFile(files: FileList | null) {
    const file = files?.[0]
    if (file) await importBuffer(await file.arrayBuffer(), file.name)
  }

  async function loadDemo() {
    setBusy(true)
    try {
      const res = await fetch('/demo/progress.sav')
      await importBuffer(await res.arrayBuffer(), 'demo progress.sav')
    } finally {
      setBusy(false)
    }
  }

  const detectedTotal = Object.values(fromSave).reduce((acc, g) => acc + Object.keys(g).length, 0)

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg">{t('save.title')}</h2>

      <section className="panel space-y-3 p-4">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('save.importTitle')}</h3>
        <p className="text-sm text-ink-mute">{t('save.importHint')}</p>
        <input ref={fileRef} type="file" accept=".sav" className="hidden" onChange={(e) => onFile(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="px-4 py-2.5 text-sm font-medium text-abyss transition-transform active:scale-95"
            style={{ background: 'var(--color-jade)', boxShadow: 'var(--glow-jade)', clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
          >
            {t('save.chooseFile')}
          </button>
          <button
            onClick={loadDemo}
            disabled={busy}
            className="panel px-4 py-2.5 text-sm text-ink-mute transition-colors hover:text-jade"
          >
            {t('save.loadDemo')}
          </button>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-gloom)' }}>{error}</p>}
      </section>

      {lastDiff && <DiffView diff={lastDiff} />}

      {saveMeta && (
        <section className="panel space-y-2 p-4">
          <h3 className="font-display text-sm uppercase tracking-widest" style={{ color: 'var(--color-jade)' }}>
            {t('save.loaded')}
          </h3>
          <dl className="grid grid-cols-2 gap-y-1 font-mono text-xs text-ink-mute">
            <dt>{t('save.version')}</dt>
            <dd className="text-right text-ink">{saveMeta.version}</dd>
            <dt>{t('save.importedAt')}</dt>
            <dd className="text-right text-ink">{new Date(saveMeta.importedAt).toLocaleString()}</dd>
            <dt>{saveMeta.fileName}</dt>
            <dd className="text-right" style={{ color: 'var(--color-jade)' }}>
              {detectedTotal.toLocaleString()} ✓
            </dd>
          </dl>
          <button onClick={clearSave} className="pt-1 text-xs text-ink-faint underline-offset-2 hover:underline">
            {t('save.clear')}
          </button>
        </section>
      )}

      <section className="panel space-y-1 p-4 opacity-70">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('save.exportTitle')}</h3>
        <p className="text-sm text-ink-faint">{t('save.exportSoon')}</p>
      </section>

      <p className="text-center text-[10px] text-ink-faint">{t('common.credits')}</p>
    </div>
  )
}
