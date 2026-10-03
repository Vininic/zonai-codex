import { categoryMeta } from './categoryMeta'
import { REGIONS, inRegion } from './regions'

/**
 * Relatório visual: um .html sozinho, com o mapa desenhado.
 *
 * Markdown puro não servia pra "o que falta e por onde passar" — o valor está
 * em ver os pontos no mapa e a linha entre eles. Aqui o mapa vira um WebP
 * embutido como data URI (PNG dava 6 MB, inviável no celular), com a rota
 * inteira traçada e TODO pendente marcado, não só as paradas da viagem.
 *
 * O arquivo leva um pouco de JS próprio pra filtrar grupo e ligar/desligar a
 * linha — sem isso um mapa com 100+ pontos vira sopa. Nada externo: abre
 * offline, em qualquer lugar.
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
  strings: {
    route: string
    pending: string
    noRoute: string
    generated: string
    mapHint: string
    showLine: string
    zoom: string
    allGroups: string
  }
}

/** nome da região que contém o ponto — o que dá pra usar quando o item não tem
 *  nome próprio (placas do Addison, poços numerados) */
const regionOf = (x: number, z: number): string => REGIONS.find((r) => inRegion(r, x, z))?.name ?? '—'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** só o mapa de fundo, já escurecido — os pontos vão em SVG por cima, pra dar pra filtrar */
async function renderBase(layer: string, scale: number): Promise<{ url: string; w: number; h: number } | null> {
  const img = new Image()
  img.src = `/map/${layer}.webp`
  try {
    await img.decode()
  } catch {
    return null
  }
  const cw = Math.round(W * scale)
  const ch = Math.round(H * scale)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, cw, ch)
  ctx.fillStyle = 'rgba(6,11,10,0.45)'
  ctx.fillRect(0, 0, cw, ch)
  // WebP a 0.82: ~300 KB contra ~6 MB do PNG, sem diferença visível no mapa
  return { url: canvas.toDataURL('image/webp', 0.82), w: cw, h: ch }
}

export async function buildReportHtml(input: ReportInput): Promise<string> {
  const scale = 0.5
  const base = await renderBase(input.layer, scale)
  const S = input.strings
  const P = (x: number, z: number) => {
    const [px, py] = toPx(x, z)
    return [px * scale, py * scale] as const
  }

  const groups = input.mapPending
    .map((g) => ({ ...g, items: g.items.filter((i) => i.layer === input.layer) }))
    .filter((g) => g.items.length)

  // Um marcador por item pendente, COLORIDO pelo grupo. Quando a parada está
  // na rota ele carrega o número da ordem; senão é só um ponto. Antes eram
  // duas camadas (pontos coloridos + números dourados) e os números tapavam
  // as cores — com 91 paradas o mapa virava sopa dourada.
  const key = (x: number, z: number) => `${Math.round(x)}|${Math.round(z)}`
  const orderOf = new Map<string, number>()
  input.stops.forEach((st, i) => orderOf.set(key(st.x, st.z), i + 1))

  const dots = groups
    .map((g) => {
      const color = categoryMeta(g.categoryId).color
      const marks = g.items
        .map((it) => {
          const [px, py] = P(it.x, it.z)
          const n = orderOf.get(key(it.x, it.z))
          const cx = px.toFixed(1)
          const cy = py.toFixed(1)
          if (n === undefined) {
            return `<circle cx="${cx}" cy="${cy}" r="8" fill="${color}" stroke="#0b1210" stroke-width="2"><title>${esc(it.label)}</title></circle>`
          }
          return `<g><circle cx="${cx}" cy="${cy}" r="15" fill="${color}" stroke="#0b1210" stroke-width="3"/><text x="${cx}" y="${(
            py + 5
          ).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="700" fill="#0b1210">${n}</text><title>${esc(
            `${n}. ${it.label}`,
          )}</title></g>`
        })
        .join('')
      return `<g class="grp" data-g="${esc(g.categoryId)}">${marks}</g>`
    })
    .join('')

  const linePts = input.stops.map((s) => P(s.x, s.z).join(',')).join(' ')

  const legend = groups
    .map(
      (g) =>
        `<button class="lg on" data-g="${esc(g.categoryId)}"><span class="dot" style="background:${categoryMeta(g.categoryId).color}"></span>${esc(
          g.label,
        )} <b>${g.items.length}</b></button>`,
    )
    .join('')

  const routeRows = input.stops
    .map(
      (s, i) =>
        `<tr><td class="n">${i + 1}</td><td>${esc(s.label)}</td><td class="g">${esc(
          groups.find((g) => g.categoryId === s.groupId)?.label ?? s.groupId,
        )}</td><td class="r">${esc(regionOf(s.x, s.z))}</td><td class="c">${Math.round(s.x)}, ${Math.round(s.z)}</td></tr>`,
    )
    .join('')

  const mapSections = groups
    .map(
      (g) => `<section>
  <h2><span class="dot" style="background:${categoryMeta(g.categoryId).color}"></span>${esc(g.label)}
    <span class="count">${g.items.length} ${esc(S.pending)}</span></h2>
  <ul class="cols">${g.items
    .map(
      (it) =>
        `<li>${esc(it.label)} <span class="r">${esc(regionOf(it.x, it.z))}</span> <span class="c">${Math.round(
          it.x,
        )}, ${Math.round(it.z)}</span></li>`,
    )
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

  const totalMap = groups.reduce((n, g) => n + g.items.length, 0)

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(input.title)}</title>
<style>
  :root{--bg:#0b1210;--panel:#121b18;--edge:#24322c;--ink:#dfe8e2;--mute:#93a39a;--faint:#6b7a72;--gold:#d9b96a}
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1100px;margin:0 auto;padding:20px 16px 56px}
  h1{font-size:20px;margin:0 0 2px}
  .sub{color:var(--faint);font-size:12px;margin-bottom:16px}
  .mapbox{border:1px solid var(--edge);background:var(--panel);border-radius:6px;overflow:hidden}
  .viewport{position:relative;overflow:auto;-webkit-overflow-scrolling:touch;background:#060b0a}
  .viewport svg{display:block;width:100%;height:auto;touch-action:pinch-zoom}
  .viewport.zoom svg{width:${base ? base.w : 2048}px;max-width:none}
  .bar{display:flex;flex-wrap:wrap;gap:6px;padding:10px;border-top:1px solid var(--edge)}
  .lg,.tg{appearance:none;background:transparent;border:1px solid var(--edge);color:var(--mute);
    border-radius:999px;padding:6px 11px;font:inherit;font-size:12px;cursor:pointer;line-height:1.2}
  .lg b{color:var(--ink);font-variant-numeric:tabular-nums}
  .lg.on{border-color:#3b4e45;background:#17221e;color:var(--ink)}
  .lg:not(.on){opacity:.45}
  .tg.on{border-color:var(--gold);color:var(--gold)}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
  .hintline{padding:0 10px 10px;color:var(--faint);font-size:11px}
  section{margin:24px 0 0}
  h2{font-size:14px;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid var(--edge);font-weight:600}
  .count{color:var(--faint);font-weight:400;font-size:12px;margin-left:6px;font-variant-numeric:tabular-nums}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:5px 6px;border-bottom:1px solid rgba(36,50,44,.5);vertical-align:top}
  td.n{width:30px;color:var(--gold);font-variant-numeric:tabular-nums;text-align:right;font-weight:600}
  td.g{color:var(--mute);width:130px}
  td.r,.r{color:var(--gold);font-size:12px}
  td.r{width:120px}
  .c{color:var(--faint);font-family:ui-monospace,monospace;font-size:11px;white-space:nowrap}
  td.c{text-align:right;width:104px}
  ul.cols{columns:2;gap:24px;list-style:none;padding:0;margin:0;font-size:14px}
  ul.cols li{break-inside:avoid;padding:3px 0}
  .hint{color:var(--faint)}
  @media(max-width:760px){
    .wrap{padding:16px 12px 48px}
    ul.cols{columns:1}
    td.g{display:none}
    .viewport{max-height:72vh}
  }
  @media print{body{background:#fff;color:#111}.bar,.hintline{display:none}
    h2{border-color:#ddd}td{border-color:#eee}.hint,.c,.sub,.count{color:#555}}
</style></head><body><div class="wrap">
<h1>${esc(input.title)}</h1>
<div class="sub">${esc(S.generated)} · ${new Date().toLocaleString()}</div>

${
  base
    ? `<div class="mapbox">
  <div class="viewport" id="vp">
    <svg viewBox="0 0 ${base.w} ${base.h}" xmlns="http://www.w3.org/2000/svg">
      <image href="${base.url}" x="0" y="0" width="${base.w}" height="${base.h}"/>
      <polyline id="line" points="${linePts}" fill="none" stroke="#e8d9a8" stroke-width="2.5"
        stroke-dasharray="10 9" stroke-linejoin="round" opacity="0.75"/>
      <g id="dots">${dots}</g>
    </svg>
  </div>
  <div class="bar">
    <button class="tg on" id="tline">${esc(S.showLine)}</button>
    <button class="tg" id="tzoom">${esc(S.zoom)}</button>
    <button class="lg on" id="tall">${esc(S.allGroups)} <b>${totalMap}</b></button>
    ${legend}
  </div>
  <div class="hintline">${esc(S.mapHint)}</div>
</div>`
    : ''
}

${input.stops.length ? `<section><h2>${esc(S.route)} <span class="count">${esc(input.layerLabel)} · ${input.stops.length}</span></h2><table>${routeRows}</table></section>` : `<section><p class="sub">${esc(S.noRoute)}</p></section>`}
${mapSections}
${checkSections}
</div>
<script>
(function(){
  var vp=document.getElementById('vp');
  var line=document.getElementById('line');
  var tline=document.getElementById('tline'), tall=document.getElementById('tall');
  if(tline) tline.onclick=function(){
    var on=tline.classList.toggle('on');
    if(line) line.style.display=on?'':'none';
  };
  var btns=[].slice.call(document.querySelectorAll('.lg[data-g]'));
  function apply(){
    btns.forEach(function(b){
      var g=document.querySelector('.grp[data-g="'+b.dataset.g+'"]');
      if(g) g.style.display=b.classList.contains('on')?'':'none';
    });
    if(tall) tall.classList.toggle('on', btns.every(function(b){return b.classList.contains('on');}));
  }
  btns.forEach(function(b){ b.onclick=function(){ b.classList.toggle('on'); apply(); }; });
  if(tall) tall.onclick=function(){
    var turnOn=!btns.every(function(b){return b.classList.contains('on');});
    btns.forEach(function(b){ b.classList.toggle('on', turnOn); });
    apply();
  };
  // Botao explicito em vez de duplo-toque: no celular dblclick nao dispara de
  // forma confiavel (o navegador usa o gesto pra zoom da pagina), entao o
  // duplo-toque simplesmente nao existia pra quem ia usar isso no telefone.
  var tzoom=document.getElementById('tzoom');
  if(tzoom&&vp) tzoom.onclick=function(){
    var on=vp.classList.toggle('zoom');
    tzoom.classList.toggle('on', on);
    if(on) vp.scrollLeft=(vp.scrollWidth-vp.clientWidth)/2;
  };
})();
</script>
</body></html>`
}
