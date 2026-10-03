/**
 * Interpretação de pedidos do chat. Núcleo local por palavras-chave
 * (a IA não pode "surtar": o plano em si é sempre determinístico);
 * Gemini BYOK só refina a interpretação de frases livres.
 */
import { aiComplete, type AiConfig } from './ai'
import { REGIONS } from './regions'

export type Intent =
  | { kind: 'armor'; label: string }
  | { kind: 'collect'; categoryIds: string[] }
  | { kind: 'region'; regionId: string }
  | { kind: 'checklist'; statIds: string[] }
  /** pedido que mistura grupos com e sem mapa ("poços, placas e tecidos") */
  | { kind: 'report'; categoryIds: string[]; statIds: string[] }
  | { kind: 'summary' }
  | { kind: 'unknown' }

const CATEGORY_ALIASES: Record<string, string[]> = {
  koroks: ['korok', 'seed', 'semente'],
  shrines: ['shrine', 'santuario', 'santuário'],
  lightroots: ['lightroot', 'raiz', 'raizes', 'raízes'],
  towers: ['tower', 'torre'],
  caves: ['cave', 'caverna'],
  bubbulfrogs: ['bubbul', 'sapo'],
  wells: ['well', 'poco', 'poço', 'pocos', 'poços'],
  chasms: ['chasm', 'abismo'],
  shrine_chests: ['shrine chest', 'bau de santuario', 'baú de santuário', 'baus de santuario'],
  hudson_sign: ['hudson', 'placa'],
  dungeon_bosses: ['boss', 'chefe'],
  hinox: ['hinox'],
  stone_talus: ['talus'],
  molduga: ['molduga'],
  frox: ['frox'],
  gleeok: ['gleeok'],
  flux_construct: ['flux', 'constructo'],
  schema_stone: ['schema stone', 'pedra-esquema', 'pedra esquema'],
  yiga_schematic: ['yiga', 'esquema'],
  old_map: ['old map', 'mapa antigo', 'mapas antigos'],
  sage_will: ['sage', 'vontade', 'will'],
  armor: ['armor chest', 'bau de armadura', 'baú de armadura'],
  general_locations: ['location', 'localidade', 'lugares'],
}

/**
 * Grupos SEM coordenada no dataset (tecidos, quests, receitas, memórias…).
 * Não dá pra traçar rota pra eles — o que dá, e é o que faltava, é listar
 * exatamente o que falta e de onde vem cada um (`source` nos tecidos,
 * ingredientes nas receitas). Ver `checklist` em Companion.tsx.
 */
const STAT_ALIASES: Record<string, string[]> = {
  fabrics_amiibo: ['fabric amiibo', 'tecido amiibo', 'amiibo fabric', 'tecidos amiibo', 'amiibo'],
  fabrics: ['fabric', 'tecido', 'tecidos', 'paraglider', 'parapente'],
  quests_side: ['side quest', 'missao secundaria', 'missão secundária', 'sidequest', 'secundaria', 'secundária'],
  quests_adventure: ['adventure quest', 'aventura', 'side adventure'],
  quests_shrine: ['shrine quest', 'missao de santuario', 'missão de santuário'],
  quests_main: ['main quest', 'missao principal', 'missão principal', 'historia', 'história'],
  memories: ['memory', 'memoria', 'memória', 'memorias', 'memórias'],
  recipes: ['recipe', 'receita', 'receitas', 'culinaria', 'culinária'],
  character_profiles: ['profile', 'perfil', 'perfis', 'personagem'],
  compendium: ['compendium', 'compendio', 'compêndio', 'enciclopedia', 'enciclopédia'],
  zonai_devices: ['device', 'dispositivo', 'zonai device', 'engenhoca'],
  pristine_weapons: ['pristine', 'intacta', 'arma intacta', 'armas intactas'],
  key_items: ['key item', 'item chave', 'itens chave', 'item-chave'],
}

/** ids dos grupos que a Purah trata como checklist (sem rota) */
export const CHECKLIST_STAT_IDS = Object.keys(STAT_ALIASES)

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function parseIntentLocal(text: string, armorLabels: string[]): Intent {
  const q = norm(text)

  if (/(what'?s left|whats left|o que falta|falta pra|resumo|overview|progress(o)? geral|situacao)/.test(q)) {
    return { kind: 'summary' }
  }

  // armadura: melhor label cujas palavras significativas aparecem no texto
  const armorish = /(armor|armadura|upgrade|upar|estrela|star|4\s*★|set)/.test(q)
  let best: { label: string; score: number } | null = null
  for (const label of armorLabels) {
    const words = norm(label)
      .replace(/[()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['the', 'of', 'non', 'lowered'].includes(w))
    if (words.length === 0) continue
    const hits = words.filter((w) => q.includes(w)).length
    const score = hits / words.length
    if (hits >= 1 && score >= 0.5 && (!best || score > best.score || (score === best.score && label.length > best.label.length))) {
      best = { label, score }
    }
  }
  if (best && (armorish || best.score === 1)) return { kind: 'armor', label: best.label }

  // aliases mais específicos (longos) primeiro: "shrine chest" antes de "shrine".
  // Coleta TODOS os grupos citados, não só o primeiro — "poços, placas do
  // Addison e localidades" é um pedido só, com três grupos.
  const flat: { alias: string; categoryId: string }[] = []
  for (const [categoryId, aliases] of Object.entries(CATEGORY_ALIASES))
    for (const alias of aliases) flat.push({ alias: norm(alias), categoryId })
  flat.sort((a, b) => b.alias.length - a.alias.length)
  const categoryHits: string[] = []
  let consumed = q
  for (const { alias, categoryId } of flat) {
    if (categoryHits.includes(categoryId)) continue
    if (consumed.includes(alias)) {
      categoryHits.push(categoryId)
      // remove o trecho casado pra um alias curto não re-casar dentro de outro
      consumed = consumed.split(alias).join(' ')
    }
  }
  const categoryHit = categoryHits[0] ?? null

  // região: "limpar Hebra", "clear Gerudo", "100% de Akkala"…
  let regionHit: string | null = null
  for (const region of REGIONS) {
    if (region.aliases.some((a) => q.includes(norm(a)))) {
      regionHit = region.id
      break
    }
  }
  const clearish = /(limpar|clear|completar|complete|fechar|finish|100|area|área|regiao|região|region|zona|zone|tudo)/.test(q)

  // grupos sem coordenada: mesma varredura, também acumulando todos
  const statFlat: { alias: string; statId: string }[] = []
  for (const [statId, aliases] of Object.entries(STAT_ALIASES))
    for (const alias of aliases) statFlat.push({ alias: norm(alias), statId })
  statFlat.sort((a, b) => b.alias.length - a.alias.length)
  const statHits: string[] = []
  let consumedStats = consumed
  for (const { alias, statId } of statFlat) {
    if (statHits.includes(statId)) continue
    if (consumedStats.includes(alias)) {
      statHits.push(statId)
      consumedStats = consumedStats.split(alias).join(' ')
    }
  }

  if (regionHit && (clearish || !categoryHit)) return { kind: 'region', regionId: regionHit }
  // pedido misto: rota pro que tem mapa + checklist pro que não tem
  if (categoryHits.length && statHits.length) return { kind: 'report', categoryIds: categoryHits, statIds: statHits }
  if (categoryHits.length) return { kind: 'collect', categoryIds: categoryHits }
  if (statHits.length) return { kind: 'checklist', statIds: statHits }
  return { kind: 'unknown' }
}

/** fallback LLM pra frases livres — devolve o MESMO formato de intent */
export async function parseIntentLLM(
  cfg: AiConfig,
  text: string,
  categoryIds: string[],
  armorLabels: string[],
  regionIds: string[],
  statIds: string[] = [],
): Promise<Intent> {
  const prompt = [
    'Classify a Zelda TOTK completion-helper request into JSON. Reply ONLY minified JSON, no markdown.',
    `Categories: ${categoryIds.join(', ')}`,
    `Regions: ${regionIds.join(', ')}`,
    `Checklist groups (no map coordinates — list-only): ${statIds.join(', ')}`,
    `Armor labels: ${armorLabels.join(' | ')}`,
    'Schema: {"kind":"armor","label":"<exact armor label>"} OR {"kind":"collect","categoryIds":["<category id>",...]} OR {"kind":"region","regionId":"<exact region id>"} OR {"kind":"checklist","statIds":["<checklist group id>",...]} OR {"kind":"report","categoryIds":[...],"statIds":[...]} OR {"kind":"summary"} OR {"kind":"unknown"}',
    'Include EVERY group the user mentions, not just the first one.',
    `Request: ${text}`,
  ].join('\n')
  try {
    const raw = await aiComplete(cfg, prompt, { json: true, temperature: 0 })
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim())
    if (parsed.kind === 'armor' && armorLabels.includes(parsed.label)) return parsed
    if (parsed.kind === 'collect' && Array.isArray(parsed.categoryIds)) {
      const ids = parsed.categoryIds.filter((c: string) => categoryIds.includes(c))
      if (ids.length) return { kind: 'collect', categoryIds: ids }
    }
    if (parsed.kind === 'region' && regionIds.includes(parsed.regionId)) return parsed
    if (parsed.kind === 'checklist' && Array.isArray(parsed.statIds)) {
      const ids = parsed.statIds.filter((c: string) => statIds.includes(c))
      if (ids.length) return { kind: 'checklist', statIds: ids }
    }
    if (parsed.kind === 'report') {
      const cids = (parsed.categoryIds ?? []).filter((c: string) => categoryIds.includes(c))
      const sids = (parsed.statIds ?? []).filter((c: string) => statIds.includes(c))
      if (cids.length || sids.length) return { kind: 'report', categoryIds: cids, statIds: sids }
    }
    if (parsed.kind === 'summary') return parsed
  } catch {
    /* intent inválida vira unknown */
  }
  return { kind: 'unknown' }
}
