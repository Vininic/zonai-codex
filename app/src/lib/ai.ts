/**
 * Camada unificada de IA:
 * - hosted: ai-proxy da suíte (Supabase Edge Function) — chave fica no servidor,
 *   zero setup pro visitante. Mesmo modelo dos irmãos Chronos/Kairos/Pluto.
 * - gemini: API do Google AI Studio, BYOK direto do browser
 * - openai: qualquer endpoint OpenAI-compatible (OpenRouter, Groq, Ollama…)
 * A IA só interpreta pedidos e narra — planos são sempre determinísticos.
 */

export type AiProvider = 'hosted' | 'gemini' | 'openai'

export interface AiConfig {
  provider: AiProvider
  key: string
  model: string
  baseUrl?: string
}

export interface AiStoreSlice {
  aiProvider: AiProvider
  geminiKey: string
  aiModel: string
  oaiBaseUrl: string
  oaiModel: string
  oaiKey: string
}

/** Projeto Supabase compartilhado da suíte (anon key é pública por design). */
const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export const HOSTED_AI_AVAILABLE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** modelos Gemini 2.5 foram aposentados pra chaves novas — migra pros aliases */
const GEMINI_LEGACY: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-flash-latest',
  'gemini-2.5-pro': 'gemini-pro-latest',
  'gemini-2.5-flash-lite': 'gemini-flash-lite-latest',
}

/** config ativa; null = sem IA disponível (planner segue funcionando) */
export function activeAiConfig(s: AiStoreSlice): AiConfig | null {
  if (s.aiProvider === 'openai') {
    if (!s.oaiKey && !s.oaiBaseUrl.includes('localhost') && !s.oaiBaseUrl.includes('127.0.0.1')) return null
    return { provider: 'openai', key: s.oaiKey, model: s.oaiModel, baseUrl: s.oaiBaseUrl.replace(/\/$/, '') }
  }
  const model = GEMINI_LEGACY[s.aiModel] ?? s.aiModel
  // BYOK Gemini quando há chave; sem chave, cai no hosted (stores antigos que
  // persistiram 'gemini' sem chave ganham o zero-setup automaticamente).
  if (s.aiProvider === 'gemini' && s.geminiKey) return { provider: 'gemini', key: s.geminiKey, model }
  return HOSTED_AI_AVAILABLE ? { provider: 'hosted', key: '', model } : null
}

/** Chama o ai-proxy da suíte (contrato flat: prompt em texto, resposta completa). */
async function hostedComplete(model: string, prompt: string, opts: { json?: boolean; temperature?: number }): Promise<string> {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      provider: 'gemini',
      model,
      // o proxy não tem modo JSON nativo — instrução no prompt cobre o caso
      prompt: opts.json ? `${prompt}\n\nResponda APENAS com JSON válido, sem cercas de código nem texto extra.` : prompt,
      temperature: opts.temperature ?? 0.5,
      maxTokens: 2048,
    }),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = ((await res.json()) as { error?: string }).error ?? '' } catch { /* ignore */ }
    throw new Error(detail || `hosted AI ${res.status}`)
  }
  const data = (await res.json()) as { text?: string }
  let text = (data.text ?? '').trim()
  if (!text) throw new Error('empty response')
  // remove cercas ```json … ``` que alguns modelos insistem em pôr
  if (opts.json) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  return text
}

export async function aiComplete(
  cfg: AiConfig,
  prompt: string,
  opts: { json?: boolean; temperature?: number } = {},
): Promise<string> {
  if (cfg.provider === 'hosted') return hostedComplete(cfg.model, prompt, opts)
  if (cfg.provider === 'gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${encodeURIComponent(cfg.key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
            ...(opts.json ? { responseMimeType: 'application/json' } : {}),
            // tarefas curtas: thinking desligado nos flash pra latência baixa
            ...(cfg.model.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
      },
    )
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 180)}`)
    const json = await res.json()
    const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!text) throw new Error('empty response')
    return text.trim()
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!res.ok) throw new Error(`${cfg.baseUrl} ${res.status}: ${(await res.text()).slice(0, 180)}`)
  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content
  if (!text) throw new Error('empty response')
  return String(text).trim()
}
