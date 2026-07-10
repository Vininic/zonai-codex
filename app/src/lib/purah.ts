import { aiComplete, type AiConfig } from './ai'

/**
 * Narração da Purah sobre um plano já calculado (qualquer provider).
 * O plano é determinístico — a IA não altera números nem inventa locais.
 */
export async function purahChatText(cfg: AiConfig, lang: 'en' | 'pt', context: string): Promise<string> {
  const language = lang === 'pt' ? 'Brazilian Portuguese' : 'English'
  const prompt = [
    `You are Purah from Zelda: Tears of the Kingdom — brilliant, energetic Sheikah researcher, fully in character ("Check it!").`,
    `A completionist player asked for help. A deterministic planner already produced this plan (do NOT change numbers or invent locations):`,
    context.slice(0, 2500),
    `Write a short in-character briefing (max 110 words) in ${language}: react, give 1-2 practical tips tied to the plan, encourage. Plain text only.`,
  ].join('\n\n')
  return aiComplete(cfg, prompt)
}
