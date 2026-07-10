/**
 * Camada unificada de IA (BYOK, direto do browser):
 * - gemini: API do Google AI Studio (chave do usuário ou VITE_GEMINI_API_KEY)
 * - openai: qualquer endpoint OpenAI-compatible (OpenRouter, Groq, Ollama…)
 * A IA só interpreta pedidos e narra — planos são sempre determinísticos.
 */

export interface AiConfig {
  provider: 'gemini' | 'openai'
  key: string
  model: string
  baseUrl?: string
}

export interface AiStoreSlice {
  aiProvider: 'gemini' | 'openai'
  geminiKey: string
  aiModel: string
  oaiBaseUrl: string
  oaiModel: string
  oaiKey: string
}

export const ENV_GEMINI_KEY: string = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ?? ''

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
  const key = s.geminiKey || ENV_GEMINI_KEY
  return key ? { provider: 'gemini', key, model: GEMINI_LEGACY[s.aiModel] ?? s.aiModel } : null
}

export async function aiComplete(
  cfg: AiConfig,
  prompt: string,
  opts: { json?: boolean; temperature?: number } = {},
): Promise<string> {
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
