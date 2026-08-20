/**
 * Interpretação de pedidos do chat. Núcleo local por palavras-chave
 * (a IA não pode "surtar": o plano em si é sempre determinístico);
 * Gemini BYOK só refina a interpretação de frases livres.
 */
import { aiComplete, type AiConfig } from './ai'
import { REGIONS } from './regions'

export type Intent =
  | { kind: 'armor'; label: string }
  | { kind: 'collect'; categoryId: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'checklist'; statId: string }
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

  // aliases mais específicos (longos) primeiro: "shrine chest" antes de "shrine"
  const flat: { alias: string; categoryId: string }[] = []
  for (const [categoryId, aliases] of Object.entries(CATEGORY_ALIASES))
    for (const alias of aliases) flat.push({ alias: norm(alias), categoryId })
  flat.sort((a, b) => b.alias.length - a.alias.length)
  let categoryHit: string | null = null
  for (const { alias, categoryId } of flat) {
    if (q.includes(alias)) {
      categoryHit = categoryId
      break
    }
  }

  // região: "limpar Hebra", "clear Gerudo", "100% de Akkala"…
  let regionHit: string | null = null
  for (const region of REGIONS) {
    if (region.aliases.some((a) => q.includes(norm(a)))) {
      regionHit = region.id
      break
    }
  }
  const clearish = /(limpar|clear|completar|complete|fechar|finish|100|area|área|regiao|região|region|zona|zone|tudo)/.test(q)

  // grupos sem coordenada: mesma varredura por alias, mais longo primeiro
  const statFlat: { alias: string; statId: string }[] = []
  for (const [statId, aliases] of Object.entries(STAT_ALIASES))
    for (const alias of aliases) statFlat.push({ alias: norm(alias), statId })
  statFlat.sort((a, b) => b.alias.length - a.alias.length)
  let statHit: string | null = null
  for (const { alias, statId } of statFlat) {
    if (q.includes(alias)) {
      statHit = statId
      break
    }
  }

  if (regionHit && (clearish || !categoryHit)) return { kind: 'region', regionId: regionHit }
  if (categoryHit) return { kind: 'collect', categoryId: categoryHit }
  if (statHit) return { kind: 'checklist', statId: statHit }
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
    'Schema: {"kind":"armor","label":"<exact armor label>"} OR {"kind":"collect","categoryId":"<exact category id>"} OR {"kind":"region","regionId":"<exact region id>"} OR {"kind":"checklist","statId":"<exact checklist group id>"} OR {"kind":"summary"} OR {"kind":"unknown"}',
    `Request: ${text}`,
  ].join('\n')
  try {
    const raw = await aiComplete(cfg, prompt, { json: true, temperature: 0 })
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim())
    if (parsed.kind === 'armor' && armorLabels.includes(parsed.label)) return parsed
    if (parsed.kind === 'collect' && categoryIds.includes(parsed.categoryId)) return parsed
    if (parsed.kind === 'region' && regionIds.includes(parsed.regionId)) return parsed
    if (parsed.kind === 'checklist' && statIds.includes(parsed.statId)) return parsed
    if (parsed.kind === 'summary') return parsed
  } catch {
    /* intent inválida vira unknown */
  }
  return { kind: 'unknown' }
}
