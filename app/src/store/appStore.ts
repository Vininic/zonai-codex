import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerStats } from '../lib/saveParser'

export interface RouteStep {
  groupId: string
  itemId: string
  label: string
  x: number
  z: number
  layer: string
}

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
  /** grupos excluídos do True 100% do usuário */
  excluded: IdSet
  /** rota planejada pela companion, desenhada no mapa */
  route: RouteStep[] | null
  /** provider de IA da companion ('hosted' = ai-proxy da suíte, sem chave) */
  aiProvider: 'hosted' | 'gemini' | 'openai'
  /** chave Gemini (BYOK) da companion */
  geminiKey: string
  /** modelo Gemini usado pela companion */
  aiModel: string
  /** endpoint OpenAI-compatible (OpenRouter/Groq/Ollama…) */
  oaiBaseUrl: string
  oaiModel: string
  oaiKey: string
  /** Purah narra os planos com a IA (quando há chave) */
  aiNarration: boolean
  /** sidebar desktop recolhida (só ícones) */
  sidebarCollapsed: boolean
  /** quantidade desejada de material (id -> qtd), staged pro editor de save */
  materialQty: Record<string, number>

  setLang: (lang: 'en' | 'pt') => void
  setTheme: (theme: 'dark' | 'light') => void
  toggleManual: (groupId: string, itemId: string) => void
  setSaveResult: (fromSave: Progress, player: PlayerStats, meta: SaveMeta, diff: ImportDiff | null) => void
  clearSave: () => void
  toggleExcluded: (groupId: string) => void
  setRoute: (route: RouteStep[] | null) => void
  setGeminiKey: (key: string) => void
  setAiModel: (model: string) => void
  setAiProvider: (p: 'hosted' | 'gemini' | 'openai') => void
  setOaiBaseUrl: (v: string) => void
  setOaiModel: (v: string) => void
  setOaiKey: (v: string) => void
  setAiNarration: (on: boolean) => void
  toggleSidebar: () => void
  setMaterialQty: (itemId: string, qty: number) => void
  clearMaterialQty: (itemId: string) => void
  /** restaura um backup JSON exportado */
  restore: (snapshot: Partial<Pick<AppState, 'manual' | 'fromSave' | 'player' | 'saveMeta' | 'excluded'>>) => void
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
      excluded: {},
      route: null,
      aiProvider: 'hosted' as const,
      geminiKey: '',
      aiModel: 'gemini-flash-latest',
      oaiBaseUrl: 'https://openrouter.ai/api/v1',
      oaiModel: 'meta-llama/llama-3.3-70b-instruct:free',
      oaiKey: '',
      aiNarration: true,
      sidebarCollapsed: false,
      materialQty: {},

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      toggleManual: (groupId, itemId) =>
        set((s) => {
          // itens confirmados pelo save não são des/marcáveis manualmente —
          // o save é a fonte de verdade até outro import ou edição (F4)
          if (s.fromSave[groupId]?.[itemId]) return s
          const group = { ...(s.manual[groupId] ?? {}) }
          if (group[itemId]) delete group[itemId]
          else group[itemId] = 1
          return { manual: { ...s.manual, [groupId]: group } }
        }),
      setSaveResult: (fromSave, player, meta, diff) =>
        set({ fromSave, player, saveMeta: meta, lastDiff: diff }),
      clearSave: () => set({ fromSave: {}, player: null, saveMeta: null, lastDiff: null }),
      toggleExcluded: (groupId) =>
        set((s) => {
          const excluded = { ...s.excluded }
          if (excluded[groupId]) delete excluded[groupId]
          else excluded[groupId] = 1
          return { excluded }
        }),
      setRoute: (route) => set({ route }),
      setGeminiKey: (geminiKey) => set({ geminiKey }),
      setAiModel: (aiModel) => set({ aiModel }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setOaiBaseUrl: (oaiBaseUrl) => set({ oaiBaseUrl }),
      setOaiModel: (oaiModel) => set({ oaiModel }),
      setOaiKey: (oaiKey) => set({ oaiKey }),
      setAiNarration: (aiNarration) => set({ aiNarration }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMaterialQty: (itemId, qty) => set((s) => ({ materialQty: { ...s.materialQty, [itemId]: qty } })),
      clearMaterialQty: (itemId) =>
        set((s) => {
          const materialQty = { ...s.materialQty }
          delete materialQty[itemId]
          return { materialQty }
        }),
      restore: (snapshot) => set(snapshot),
    }),
    { name: 'zonai-codex' },
  ),
)
