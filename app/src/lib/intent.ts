/**
 * Interpretação de pedidos do chat. Núcleo local por palavras-chave
 * (a IA não pode "surtar": o plano em si é sempre determinístico);
 * Gemini BYOK só refina a interpretação de frases livres.
 */
export type Intent =
  | { kind: 'armor'; label: string }
  | { kind: 'collect'; categoryId: string }
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
  for (const { alias, categoryId } of flat) {
    if (q.includes(alias)) return { kind: 'collect', categoryId }
  }
  return { kind: 'unknown' }
}

/** fallback LLM pra frases livres — devolve o MESMO formato de intent */
export async function parseIntentLLM(
  apiKey: string,
  text: string,
  categoryIds: string[],
  armorLabels: string[],
  model = 'gemini-2.5-flash',
): Promise<Intent> {
  const prompt = [
    'Classify a Zelda TOTK completion-helper request into JSON. Reply ONLY minified JSON, no markdown.',
    `Categories: ${categoryIds.join(', ')}`,
    `Armor labels: ${armorLabels.join(' | ')}`,
    'Schema: {"kind":"armor","label":"<exact armor label>"} OR {"kind":"collect","categoryId":"<exact category id>"} OR {"kind":"summary"} OR {"kind":"unknown"}',
    `Request: ${text}`,
  ].join('\n')
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0 } }),
    },
  )
  if (!res.ok) return { kind: 'unknown' }
  const json = await res.json()
  const raw: string = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  try {
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, '').trim())
    if (parsed.kind === 'armor' && armorLabels.includes(parsed.label)) return parsed
    if (parsed.kind === 'collect' && categoryIds.includes(parsed.categoryId)) return parsed
  } catch {
    /* intent inválida vira unknown */
  }
  return { kind: 'unknown' }
}
