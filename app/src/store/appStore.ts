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

interface AppState {
  lang: 'en' | 'pt'
  theme: 'dark' | 'light'
  /** checks manuais do usuário, por categoria/stat */
  manual: Progress
  /** itens detectados no último save importado */
  fromSave: Progress
  player: PlayerStats | null
  saveMeta: SaveMeta | null

  setLang: (lang: 'en' | 'pt') => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleManual: (groupId: string, itemId: string) => void
  setSaveResult: (fromSave: Progress, player: PlayerStats, meta: SaveMeta) => void
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

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      toggleManual: (groupId, itemId) =>
        set((s) => {
          const group = { ...(s.manual[groupId] ?? {}) }
          if (group[itemId]) delete group[itemId]
          else group[itemId] = 1
          return { manual: { ...s.manual, [groupId]: group } }
        }),
      setSaveResult: (fromSave, player, meta) => set({ fromSave, player, saveMeta: meta }),
      clearSave: () => set({ fromSave: {}, player: null, saveMeta: null }),
    }),
    { name: 'zonai-codex' },
  ),
)
