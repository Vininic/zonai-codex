import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerStats } from '../lib/saveParser'

/** conjuntos de ids serializados como Record pra persistir em JSON */
export type IdSet = Record<string, 1>
export type Progress = Record<string, IdSet>

export interface SaveMeta {
  version: string
  fileName: string
  importedAt: string
}

export interface GroupDiff {
  groupId: string
  /** ids concluídos no save novo mas não no anterior */
  added: string[]
  /** ids concluídos no anterior mas não no novo (save mais antigo) */
  removed: string[]
}

export interface PlayerDelta {
  key: 'rupees' | 'hearts' | 'stamina' | 'battery'
  from: number
  to: number
}

export interface ImportDiff {
  fromFile: string
  toFile: string
  at: string
  groups: GroupDiff[]
  player: PlayerDelta[]
}

interface AppState {
  lang: 'en' | 'pt'
  theme: 'dark' | 'light'
  /** checks manuais do usuário, por categoria/stat */
  manual: Progress
  /** itens detectados no último save importado */
  fromSave: Progress
  player: PlayerStats | null
  saveMeta: SaveMeta | null
  /** diff do último import feito sobre um save já carregado */
  lastDiff: ImportDiff | null

  setLang: (lang: 'en' | 'pt') => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleManual: (groupId: string, itemId: string) => void
  setSaveResult: (fromSave: Progress, player: PlayerStats, meta: SaveMeta, diff: ImportDiff | null) => void
  clearSave: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      lang: 'en',
      theme: 'dark',
      manual: {},
      fromSave: {},
      player: null,
      saveMeta: null,
      lastDiff: null,

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      toggleManual: (groupId, itemId) =>
        set((s) => {
          const group = { ...(s.manual[groupId] ?? {}) }
          if (group[itemId]) delete group[itemId]
          else group[itemId] = 1
          return { manual: { ...s.manual, [groupId]: group } }
        }),
      setSaveResult: (fromSave, player, meta, diff) =>
        set({ fromSave, player, saveMeta: meta, lastDiff: diff }),
      clearSave: () => set({ fromSave: {}, player: null, saveMeta: null, lastDiff: null }),
    }),
    { name: 'zonai-codex' },
  ),
)
