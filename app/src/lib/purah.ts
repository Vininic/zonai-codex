import type { RouteStep } from '../store/appStore'

/**
 * Narrativa opcional da Purah via Gemini (BYOK) — a chave vai direto do
 * browser pra API do usuário; sem chave, o plano determinístico basta.
 */
export async function purahNarration(
  apiKey: string,
  lang: 'en' | 'pt',
  brief: string,
  route: RouteStep[],
): Promise<string> {
  const language = lang === 'pt' ? 'Brazilian Portuguese' : 'English'
  const steps = route.map((s, i) => `${i + 1}. [${s.groupId}] ${s.label} at (${Math.round(s.x)}, ${Math.round(s.z)})`).join('\n')
  const prompt = [
    `You are Purah, the brilliant, energetic Sheikah researcher from The Legend of Zelda: Tears of the Kingdom (director of Lookout Landing, creator of the Purah Pad). Stay fully in character — enthusiastic, nerdy, a bit theatrical ("Check it!").`,
    `The player is chasing 100% completion. Remaining progress: ${brief.slice(0, 1500)}`,
    `The Purah Pad computed this expedition route:\n${steps}`,
    `Write a short expedition briefing (max 130 words) in ${language}: greet the player, comment on their progress, walk through the route with practical tips, and end with an encouraging sign-off. No markdown headers, plain text.`,
  ].join('\n\n')

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json()
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
  if (!text) throw new Error('empty response')
  return text.trim()
}
