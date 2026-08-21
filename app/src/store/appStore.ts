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
  /** primeira parada de uma perna: você chegou aqui teleportando, não andando.
   *  O mapa quebra a linha aqui em vez de ligar a pé com a parada anterior. */
  legStart?: boolean
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

export interface PlayerEdits {
  rupees?: number
  hearts?: number
  staminaWheels?: number
  batteryCells?: number
}

export interface EquipmentGrant {
  category: 'bows' | 'weapons' | 'shields'
  id: string
  durability: number
  /** nome do modificador; gravado no save como hash murmur3 */
  modifier: string
  modifierValue: number
}

/**
 * Alteração num slot de equipamento que JÁ existe no save, identificado por
 * `${category}:${index}` (o índice é o slot real no array do pouch, não a
 * posição na grade). `null` em `deleted` marca o slot pra ser esvaziado.
 */
export interface EquipmentEdit {
  durability?: number
  modifier?: string
  modifierValue?: number
}

/** Alteração num cavalo que já existe, por índice de slot em OwnedHorseList. */
export interface HorseEdit {
  name?: string
  bond?: number
  statsStrength?: number
  statsSpeed?: number
  statsStamina?: number
  statsPull?: number
  mane?: string
  saddle?: string
  rein?: string
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
  /** edições de player pendentes (rupees/corações/stamina/bateria).
   *  Vive no store, e não no componente, senão sai da tela ao trocar de página
   *  e o editor parece que "não faz nada" — foi exatamente esse o bug. */
  playerEdits: PlayerEdits
  /** equipamento a conceder em slots vazios do pouch, staged pro editor */
  equipmentGrants: EquipmentGrant[]
  grantEpona: boolean
  /** chave `${category}:${index}` -> campos alterados */
  equipmentEdits: Record<string, EquipmentEdit>
  /** chaves `${category}:${index}` a esvaziar */
  equipmentDeletes: string[]
  /** índice do slot em OwnedHorseList -> campos alterados */
  horseEdits: Record<number, HorseEdit>
  /** índices de slot de cavalo a esvaziar */
  horseDeletes: number[]

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
  setMaterialQtyBulk: (entries: Record<string, number>) => void
  setPlayerEdit: (key: keyof PlayerEdits, value: number) => void
  clearPlayerEdits: () => void
  addEquipmentGrant: (grant: EquipmentGrant) => void
  removeEquipmentGrant: (index: number) => void
  setGrantEpona: (v: boolean) => void
  setEquipmentEdit: (key: string, patch: EquipmentEdit) => void
  clearEquipmentEdit: (key: string) => void
  toggleEquipmentDelete: (key: string) => void
  setHorseEdit: (index: number, patch: HorseEdit) => void
  clearHorseEdit: (index: number) => void
  toggleHorseDelete: (index: number) => void
  clearPouchEdits: () => void
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
      playerEdits: {},
      equipmentGrants: [],
      grantEpona: false,
      equipmentEdits: {},
      equipmentDeletes: [],
      horseEdits: {},
      horseDeletes: [],

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
      setMaterialQtyBulk: (entries) => set((s) => ({ materialQty: { ...s.materialQty, ...entries } })),
      setPlayerEdit: (key, value) => set((s) => ({ playerEdits: { ...s.playerEdits, [key]: value } })),
      clearPlayerEdits: () => set({ playerEdits: {} }),
      addEquipmentGrant: (grant) => set((s) => ({ equipmentGrants: [...s.equipmentGrants, grant] })),
      removeEquipmentGrant: (index) =>
        set((s) => ({ equipmentGrants: s.equipmentGrants.filter((_, i) => i !== index) })),
      setGrantEpona: (v) => set({ grantEpona: v }),
      setEquipmentEdit: (key, patch) =>
        set((s) => ({ equipmentEdits: { ...s.equipmentEdits, [key]: { ...s.equipmentEdits[key], ...patch } } })),
      clearEquipmentEdit: (key) =>
        set((s) => {
          const equipmentEdits = { ...s.equipmentEdits }
          delete equipmentEdits[key]
          return { equipmentEdits }
        }),
      toggleEquipmentDelete: (key) =>
        set((s) => ({
          equipmentDeletes: s.equipmentDeletes.includes(key)
            ? s.equipmentDeletes.filter((k) => k !== key)
            : [...s.equipmentDeletes, key],
        })),
      setHorseEdit: (index, patch) =>
        set((s) => ({ horseEdits: { ...s.horseEdits, [index]: { ...s.horseEdits[index], ...patch } } })),
      clearHorseEdit: (index) =>
        set((s) => {
          const horseEdits = { ...s.horseEdits }
          delete horseEdits[index]
          return { horseEdits }
        }),
      toggleHorseDelete: (index) =>
        set((s) => ({
          horseDeletes: s.horseDeletes.includes(index)
            ? s.horseDeletes.filter((i) => i !== index)
            : [...s.horseDeletes, index],
        })),
      clearPouchEdits: () => set({ equipmentEdits: {}, equipmentDeletes: [], horseEdits: {}, horseDeletes: [], equipmentGrants: [], grantEpona: false }),
      restore: (snapshot) => set(snapshot),
    }),
    { name: 'zonai-codex' },
  ),
)
