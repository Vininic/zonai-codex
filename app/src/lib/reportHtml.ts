import { categoryMeta } from './categoryMeta'

/**
 * Relatório visual: um .html sozinho, com o mapa desenhado.
 *
 * Markdown puro não servia pra "o que falta e por onde passar" — o valor está
 * em ver os pontos no mapa e a linha da rota entre eles. Aqui o mapa é
 * rasterizado num canvas (imagem de fundo + pendências + rota numerada),
 * virando um PNG embutido como data URI, então o arquivo abre sozinho em
 * qualquer lugar, sem depender do app nem de internet.
 */

/** mesma projeção do MapPage: imagem 4096×3413 gerada de x∈[-6000,6000], z∈[-5000,5000] */
const W = 4096
const H = 3413
const toPx = (x: number, z: number): [number, number] => [((x + 6000) / 12000) * W, ((5000 - z) / 10000) * H]

export interface ReportStop {
  label: string
  x: number
  z: number
  groupId: string
}
export interface ReportPendingGroup {
  categoryId: string
  label: string
  items: { label: string; x: number; z: number; layer: string }[]
}
export interface ReportChecklist {
  statId: string
  label: string
  total: number
  pending: { label: string; hint?: string }[]
}

export interface ReportInput {
  title: string
  layer: string
  layerLabel: string
  stops: ReportStop[]
  mapPending: ReportPendingGroup[]
  checklists: ReportChecklist[]
  /** texto já traduzido, pra o módulo não depender do i18n */
  strings: { route: string; pending: string; remaining: string; noRoute: string; generated: string }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** desenha mapa + pendências + rota e devolve um PNG como data URI */
async function renderMap(input: ReportInput, scale = 0.5): Promise<string | null> {
  const img = new Image()
  img.src = `/map/${input.layer}.webp`
  try {
    await img.decode()
  } catch {
    return null // sem a imagem o relatório ainda sai, só sem figura
  }

  const cw = Math.round(W * scale)
  const ch = Math.round(H * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, cw, ch)

  // escurece um pouco pro traçado saltar
  ctx.fillStyle = 'rgba(8,14,12,0.35)'
  ctx.fillRect(0, 0, cw, ch)

  const P = (x: number, z: number): [number, number] => {
    const [px, py] = toPx(x, z)
    return [px * scale, py * scale]
  }

  // 1) tudo que falta, como pontinhos na cor do grupo
  for (const g of input.mapPending) {
    const color = categoryMeta(g.categoryId).color
    ctx.fillStyle = color
    for (const it of g.items) {
      if (it.layer !== input.layer) continue
      const [px, py] = P(it.x, it.z)
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.arc(px, py, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1

  // 2) a linha da rota, na ordem de visita
  if (input.stops.length > 1) {
    ctx.strokeStyle = '#d9b96a'
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.setLineDash([9, 7])
    ctx.beginPath()
    input.stops.forEach((s, i) => {
      const [px, py] = P(s.x, s.z)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 3) paradas numeradas por cima
  input.stops.forEach((s, i) => {
    const [px, py] = P(s.x, s.z)
    ctx.beginPath()
    ctx.arc(px, py, 11, 0, Math.PI * 2)
    ctx.fillStyle = '#d9b96a'
    ctx.fill()
    ctx.strokeStyle = 'rgba(8,14,12,0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#0b1210'
    ctx.font = '600 12px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), px, py + 0.5)
  })

  return canvas.toDataURL('image/png')
}

export async function buildReportHtml(input: ReportInput): Promise<string> {
  const mapUrl = await renderMap(input)
  const S = input.strings

  const legend = input.mapPending
    .filter((g) => g.items.some((i) => i.layer === input.layer))
    .map((g) => {
      const n = g.items.filter((i) => i.layer === input.layer).length
      return `<li><span class="dot" style="background:${categoryMeta(g.categoryId).color}"></span>${esc(g.label)} <b>${n}</b></li>`
    })
    .join('')

  const routeRows = input.stops
    .map(
      (s, i) =>
        `<tr><td class="n">${i + 1}</td><td>${esc(s.label)}</td><td class="g">${esc(
          input.mapPending.find((g) => g.categoryId === s.groupId)?.label ?? s.groupId,
        )}</td><td class="c">${Math.round(s.x)}, ${Math.round(s.z)}</td></tr>`,
    )
    .join('')

  const mapSections = input.mapPending
    .filter((g) => g.items.length)
    .map(
      (g) => `<section>
  <h2><span class="dot" style="background:${categoryMeta(g.categoryId).color}"></span>${esc(g.label)}
    <span class="count">${g.items.length} ${esc(S.pending)}</span></h2>
  <ul class="cols">${g.items
    .map((it) => `<li>${esc(it.label)} <span class="c">${Math.round(it.x)}, ${Math.round(it.z)}</span></li>`)
    .join('')}</ul>
</section>`,
    )
    .join('')

  const checkSections = input.checklists
    .filter((c) => c.pending.length)
    .map(
      (c) => `<section>
  <h2>${esc(c.label)} <span class="count">${c.pending.length}/${c.total} ${esc(S.pending)}</span></h2>
  <ul class="cols">${c.pending
    .map((r) => `<li>${esc(r.label)}${r.hint ? ` <span class="hint">— ${esc(r.hint)}</span>` : ''}</li>`)
    .join('')}</ul>
</section>`,
    )
    .join('')

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(input.title)}</title>
<style>
  :root{--bg:#0b1210;--panel:#121b18;--edge:#24322c;--ink:#dfe8e2;--mute:#93a39a;--faint:#64736b;--gold:#d9b96a;--jade:#5fd3a6}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
  h1{font-size:22px;margin:0 0 4px;letter-spacing:.02em}
  .sub{color:var(--faint);font-size:12px;margin-bottom:22px}
  figure{margin:0 0 10px;border:1px solid var(--edge);background:var(--panel);border-radius:4px;overflow:hidden}
  figure img{display:block;width:100%;height:auto}
  .legend{list-style:none;display:flex;flex-wrap:wrap;gap:14px;padding:12px;margin:0;border-top:1px solid var(--edge);font-size:12px;color:var(--mute)}
  .legend b{color:var(--ink);font-variant-numeric:tabular-nums}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:baseline}
  .route-dot{background:var(--gold)}
  section{margin:26px 0 0}
  h2{font-size:14px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid var(--edge);font-weight:600}
  .count{color:var(--faint);font-weight:400;font-size:12px;margin-left:6px;font-variant-numeric:tabular-nums}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:4px 8px;border-bottom:1px solid rgba(36,50,44,.5)}
  td.n{width:34px;color:var(--gold);font-variant-numeric:tabular-nums;text-align:right;font-weight:600}
  td.g{color:var(--mute);width:150px}
  td.c,.c{color:var(--faint);font-family:ui-monospace,monospace;font-size:11px;white-space:nowrap}
  td.c{text-align:right;width:110px}
  ul.cols{columns:2;gap:26px;list-style:none;padding:0;margin:0;font-size:13px}
  ul.cols li{break-inside:avoid;padding:2px 0;color:var(--ink)}
  .hint{color:var(--faint)}
  @media(max-width:700px){ul.cols{columns:1}}
  @media print{body{background:#fff;color:#111}.wrap{max-width:none}figure{border-color:#ccc}
    h2{border-color:#ddd}td{border-color:#eee}.hint,.c,.sub,.count{color:#666}}
</style></head><body><div class="wrap">
<h1>${esc(input.title)}</h1>
<div class="sub">${esc(S.generated)} · ${new Date().toLocaleString()}</div>
${
  mapUrl
    ? `<figure><img src="${mapUrl}" alt="">
<ul class="legend"><li><span class="dot route-dot"></span>${esc(S.route)} (${esc(input.layerLabel)}) <b>${input.stops.length}</b></li>${legend}</ul></figure>`
    : ''
}
${input.stops.length ? `<section><h2>${esc(S.route)} <span class="count">${esc(input.layerLabel)}</span></h2><table>${routeRows}</table></section>` : `<section><p class="sub">${esc(S.noRoute)}</p></section>`}
${mapSections}
${checkSections}
</div></body></html>`
}
