import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseSave, SaveParseError } from '../lib/saveParser'
import { evaluateSave } from '../lib/completion'
import { computeImportDiff } from '../lib/importDiff'
import { applyEdits, buildEditPlan, computeStaged, type PlayerEdits } from '../lib/saveWriter'
import { getSessionSave, setSessionSave } from '../lib/saveSession'
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
  const manual = useAppStore((s) => s.manual)
  const player = useAppStore((s) => s.player)
  const excluded = useAppStore((s) => s.excluded)
  const restore = useAppStore((s) => s.restore)
  const lastDiff = useAppStore((s) => s.lastDiff)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)

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
      const prev = useAppStore.getState()
      const diff = prev.saveMeta
        ? computeImportDiff(prev.fromSave, progress, prev.player, parsed.player, prev.saveMeta.fileName, fileName)
        : null
      setSessionSave(buffer, fileName)
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

  function exportProgressJson() {
    const snapshot = { manual, fromSave, player, saveMeta, excluded, exportedAt: new Date().toISOString() }
    download(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), 'zonai-codex-progress.json')
  }

  async function importProgressJson(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    try {
      const snap = JSON.parse(await file.text())
      restore({ manual: snap.manual ?? {}, fromSave: snap.fromSave ?? {}, player: snap.player ?? null, saveMeta: snap.saveMeta ?? null, excluded: snap.excluded ?? {} })
      setError(null)
    } catch {
      setError(t('save.invalidJson'))
    }
  }

  const detectedTotal = Object.values(fromSave).reduce((acc, g) => acc + Object.keys(g).length, 0)

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg">{t('save.title')}</h2>

      <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="space-y-4">
      <section className="panel space-y-3 p-4">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('save.importTitle')}</h3>
        <p className="text-sm text-ink-mute">{t('save.importHint')}</p>
        <input ref={fileRef} type="file" accept=".sav" className="hidden" onChange={(e) => onFile(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-jade">
            {t('save.chooseFile')}
          </button>
          <button onClick={loadDemo} disabled={busy} className="panel px-4 py-2.5 text-sm text-ink-mute transition-colors hover:text-jade">
            {t('save.loadDemo')}
          </button>
        </div>
        {error && <p className="text-sm" style={{ color: 'var(--color-gloom)' }}>{error}</p>}
      </section>

      {lastDiff && <DiffView diff={lastDiff} />}
      </div>

      <div className="space-y-4">
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

      {saveMeta && <EditorSection onExported={importBuffer} />}

      <section className="panel space-y-2 p-4">
        <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('save.backupTitle')}</h3>
        <p className="text-sm text-ink-faint">{t('save.backupHint')}</p>
        <input ref={jsonRef} type="file" accept=".json" className="hidden" onChange={(e) => importProgressJson(e.target.files)} />
        <div className="flex flex-wrap gap-2">
          <button onClick={exportProgressJson} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
            {t('save.exportJson')}
          </button>
          <button onClick={() => jsonRef.current?.click()} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
            {t('save.importJson')}
          </button>
        </div>
      </section>
      </div>
      </div>

      <p className="text-center text-[10px] text-ink-faint">{t('common.credits')}</p>
    </div>
  )
}

function EditorSection({ onExported }: { onExported: (buffer: ArrayBuffer, fileName: string) => Promise<void> }) {
  const { t } = useTranslation()
  const data = useDataset()
  const manual = useAppStore((s) => s.manual)
  const fromSave = useAppStore((s) => s.fromSave)
  const player = useAppStore((s) => s.player)

  const session = getSessionSave()
  const staged = useMemo(() => computeStaged(data, manual, fromSave), [data, manual, fromSave])
  const writable = staged.filter((s) => s.writable)
  const unsupported = staged.filter((s) => !s.writable)

  const [selected, setSelected] = useState<Set<string>>(() => new Set(writable.map((s) => s.groupId)))
  const [edits, setEdits] = useState<PlayerEdits>({})

  const groupName = (id: string, fallback: string) => {
    const key = `groups.${id}`
    const tr = t(key)
    return tr === key ? fallback : tr
  }

  const plan = useMemo(
    () => buildEditPlan(data, staged, selected, edits, player),
    [data, staged, selected, edits, player],
  )
  const itemOnlyPlan = useMemo(() => buildEditPlan(data, staged, selected, {}, null), [data, staged, selected])
  const playerChanges = plan.writes.size - itemOnlyPlan.writes.size

  function toggleGroup(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function exportEdited() {
    if (!session) return
    const { buffer } = applyEdits(session.buffer, plan)
    const name = 'progress.sav'
    download(new Blob([buffer], { type: 'application/octet-stream' }), name)
    // reimporta o save editado: o tracker sincroniza e o diff do import mostra o que mudou
    await onExported(buffer, t('save.editedName'))
  }

  function downloadBackup() {
    if (!session) return
    download(new Blob([session.buffer], { type: 'application/octet-stream' }), `backup-${session.fileName.replace(/[^\w.-]+/g, '_')}`)
  }

  const numField = (
    key: keyof PlayerEdits,
    label: string,
    current: number | undefined,
    max: number,
  ) => (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-ink-mute">
      {label}
      <input
        type="number"
        min={0}
        max={max}
        value={edits[key] ?? current ?? 0}
        onChange={(e) => setEdits((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
        className="panel w-full bg-stone px-2 py-1.5 font-mono text-sm text-ink focus:outline-none"
      />
    </label>
  )

  return (
    <section className="panel space-y-3 p-4">
      <h3 className="font-display text-sm uppercase tracking-widest text-ink-mute">{t('save.exportTitle')}</h3>

      {!session && <p className="text-sm" style={{ color: 'var(--color-gold)' }}>{t('save.needSession')}</p>}

      {session && (
        <>
          <div className="grid grid-cols-4 gap-2">
            {numField('rupees', t('hud.rupees'), player?.rupees, 999999)}
            {numField('hearts', t('hud.hearts'), player?.hearts, 40)}
            {numField('staminaWheels', t('hud.stamina'), player?.staminaWheels, 3)}
            {numField('batteryCells', t('hud.battery'), player?.batteryCells, 48)}
          </div>

          {writable.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-ink-mute">{t('save.stagedHint')}</p>
              {writable.map((sg) => (
                <label key={sg.groupId} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(sg.groupId)}
                    onChange={() => toggleGroup(sg.groupId)}
                    className="h-4 w-4 accent-(--color-jade)"
                  />
                  <span className="min-w-0 flex-1 truncate">{groupName(sg.groupId, sg.label)}</span>
                  <span className="font-mono text-xs" style={{ color: 'var(--color-jade)' }}>
                    +{sg.itemIds.length}
                  </span>
                </label>
              ))}
            </div>
          )}
          {writable.length === 0 && <p className="text-xs text-ink-faint">{t('save.noStaged')}</p>}

          {unsupported.length > 0 && (
            <p className="text-[11px] text-ink-faint">
              {t('save.unsupported')}: {unsupported.map((sg) => `${groupName(sg.groupId, sg.label)} (+${sg.itemIds.length})`).join(', ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={exportEdited} disabled={plan.writes.size === 0} className="btn-jade disabled:opacity-40">
              {t('save.writeExport')}
            </button>
            <button onClick={downloadBackup} className="panel px-3 py-2 text-xs text-ink-mute hover:text-jade">
              {t('save.downloadBackup')}
            </button>
            <span className="font-mono text-[11px] text-ink-faint">
              {plan.itemCount} items · {playerChanges > 0 ? playerChanges : 0} player
            </span>
          </div>
        </>
      )}
    </section>
  )
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
