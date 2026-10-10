// Gera app/public/data/quest_info.json: pra cada quest do dataset, quem dá,
// onde começa, recompensa, os passos do Diário de Aventura e — quando o texto
// cita um lugar conhecido — o DESTINO, com coordenada pro mapa.
//
// Fonte: Zelda Wiki (zeldawiki.wiki), MediaWiki com API aberta. O Zelda
// Dungeon seria a escolha natural, mas fica atrás de Cloudflare (API
// inacessível) e manda X-Frame-Options: SAMEORIGIN (não dá pra embutir);
// pra ele o app só oferece link.
//
// Texto: o "Overview" da wiki costuma ser esboço ou história em parágrafo
// longo. O que serve jogando é a seção Objectives — é o texto do Diário de
// Aventura do próprio jogo, passo a passo, e os termos que o jogo destaca em
// vermelho ({{Color TotK|Red|...}}) são exatamente o quê/onde. Esses viram
// **negrito** no JSON e são a base pra achar o destino.
//
// Uso: node scripts/build-quest-info.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API = 'https://zeldawiki.wiki/w/api.php';
const QUEST_GROUPS = ['quests_main', 'quests_side', 'quests_adventure', 'quests_shrine'];
const UA = { 'User-Agent': 'zonai-codex/1.0 (completion tracker; build script)' };

const data = JSON.parse(readFileSync(join(ROOT, 'app/public/data/completion_data.json'), 'utf8'));

// ---- índice nome -> coordenada, a partir das categorias com mapa ----
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const places = new Map();
for (const cat of data.categories) {
  for (const it of cat.items) {
    let name = it.label;
    if (!name && it.note) name = it.note.replace(/^\d{12,}\s*-?\s*/, '').trim();
    if (!name || /^0x[0-9a-f]+$/i.test(name) || /^(Well|Cave)_/.test(name)) continue;
    const k = norm(name);
    const layer = it.layer ?? 'surface';
    // o mesmo nome existe em mais de uma camada (Satori Mountain tem versão nas
    // Depths); a superfície vence, senão a quest de foto aponta pro subsolo
    const prev = places.get(k);
    if (!prev || (prev.layer !== 'surface' && layer === 'surface'))
      places.set(k, { x: Math.round(it.x), z: Math.round(it.z), layer, name });
  }
}
// nomes curtos casam por acaso dentro de frases; só entram nomes razoáveis,
// e os mais longos primeiro ("Lookout Landing" antes de "Landing")
const placeNames = [...places.keys()].filter((k) => k.length >= 7).sort((a, b) => b.length - a.length);

// ---- limpeza de wikitext ----
function renderTemplate(inner) {
  const parts = inner.split('|');
  const name = parts[0].trim();
  // {{Color TotK|Red|texto}}: vermelho é o destaque do jogo -> **negrito**
  if (/^Color/i.test(name)) {
    const text = parts[parts.length - 1];
    return /^red$/i.test((parts[1] ?? '').trim()) ? `**${text}**` : text;
  }
  // {{Term/Store|Nome|Exibição|Series, TotK}}: o texto é o 2º argumento (ou o 1º).
  // Pegar o último era o que gerava '"Series, TotK" is a Side Quest...'
  if (/^Term/i.test(name)) return (parts[2] || parts[1] || '').trim();
  if (/^(Big|Small|Plural)$/i.test(name)) return parts[parts.length - 1];
  if (/^Rupee$/i.test(name)) return `${parts[parts.length - 1]} rupees`;
  return '';
}
function stripWiki(s) {
  let out = s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  for (let i = 0; i < 8; i++) out = out.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => renderTemplate(inner));
  out = out.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  out = out.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  out = out.replace(/'''?/g, '');
  return out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const hasQuestBox = (text) => /\{\{\s*Infobox Quest/i.test(text);

function infoboxField(text, field) {
  const m = text.match(new RegExp(`\\n\\|\\s*${field}\\s*=([^\\n]*)`));
  return m ? stripWiki(m[1]).replace(/\*\*/g, '') : '';
}

function rewardOf(text) {
  const m = text.match(/\n\|\s*reward\s*=([\s\S]*?)\n\|\s*\w+\s*=/);
  if (!m) return '';
  const items = [...m[1].matchAll(/\*\s*([^\n]+)/g)].map((x) => stripWiki(x[1])).filter(Boolean);
  if (items.length) return items.join(', ');
  // {{Icon List|TotK|Gold Rupee}} em linha só
  const inline = m[1].match(/Icon List\|[^|]*\|([^}]*)\}\}/);
  return inline ? inline[1].trim() : stripWiki(m[1]);
}

/** Passos do Diário de Aventura. Pula o "Complete" (é o fim, não ajuda a
 *  fazer) e os passos condicionais de inventário cheio. */
function objectivesOf(text) {
  const start = text.search(/\{\{\s*Quest Objectives/);
  if (start < 0) return [];
  // acha o fechamento do template contando chaves
  let depth = 0, end = start;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; }
    else if (text[i] === '}' && text[i + 1] === '}') { depth--; i++; if (depth === 0) { end = i + 1; break; } }
  }
  // exclui o "}}" final do PRÓPRIO template; cada célula fica com as chaves
  // balanceadas (antes eu arrancava o "}}" de cada linha e sobrava
  // "{{Color TotK|Purah Pad|" aberto no texto)
  const body = text.slice(start, end - 1);
  const steps = [];
  for (const row of body.split(/\n\|-/).slice(1)) {
    const cells = row.split(/\n\|\s?/).map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const label = cells[0];
    if (/^complete/i.test(stripWiki(label))) continue;
    if (/inventory|Inventory/.test(label) && /full/i.test(label)) continue;
    const txt = stripWiki(cells.slice(1).join('\n'));
    if (txt && !steps.includes(txt)) steps.push(txt);
  }
  return steps;
}

/** Overview só como reserva: corta em fim de frase, nunca no meio da palavra,
 *  e descarta a frase-padrão "X is a Side Quest in Tears of the Kingdom". */
function overviewOf(text) {
  const m = text.match(/==\s*Overview\s*==\s*\n([\s\S]*?)(\n==|$)/);
  if (!m) return '';
  const plain = stripWiki(m[1]).replace(/\n/g, ' ');
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [];
  const useful = sentences.map((s) => s.trim()).filter((s) => !/is an? (Side|Main|Shrine)? ?Quest|Side Adventure in/i.test(s) && s.length > 25);
  let out = '';
  for (const s of useful) {
    if ((out + ' ' + s).length > 420) break;
    out = out ? `${out} ${s}` : s;
  }
  return out;
}

/** lugares citados no texto dos passos que existem no mapa */
function targetsOf(steps, startLocation) {
  const hay = ` ${norm(steps.join(' '))} `;
  const found = [];
  const used = [];
  for (const k of placeNames) {
    const i = hay.indexOf(` ${k} `);
    if (i < 0) continue;
    // não aceita um nome que está dentro de outro já casado
    if (used.some(([a, b]) => i >= a && i < b)) continue;
    used.push([i, i + k.length + 2]);
    if (startLocation && norm(startLocation) === k) continue; // já é o "onde começa"
    const p = places.get(k);
    found.push({ name: p.name, x: p.x, z: p.z, layer: p.layer, at: i });
  }
  // Marcos grandes da superfície (Satori Mountain, Death Mountain, Korok
  // Forest) só aparecem no dataset rotulados na camada das Depths. As Depths
  // espelham a superfície em x/z, então a coordenada serve; só a etiqueta muda.
  // Mantém "depths" apenas quando a quest fala mesmo das Depths.
  const mentionsDepths = /\bdepths\b/i.test(steps.join(' '));
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, 3)
    .map(({ at, ...rest }) => (rest.layer === 'depths' && !mentionsDepths ? { ...rest, layer: 'surface' } : rest));
}

// ---- busca em lotes ----
async function fetchPages(titles) {
  const url =
    `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json` +
    `&titles=${encodeURIComponent(titles.join('|'))}`;
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const back = new Map();
  for (const n of j.query?.normalized ?? []) back.set(n.to, n.from);
  for (const rd of j.query?.redirects ?? []) back.set(rd.to, back.get(rd.from) ?? rd.from);
  const pages = {};
  for (const p of Object.values(j.query?.pages ?? {})) {
    if (p.missing !== undefined) continue;
    const content = p.revisions?.[0]?.slots?.main?.['*'] ?? '';
    pages[back.get(p.title) ?? p.title] = { title: p.title, content };
  }
  return pages;
}

const out = {};
let total = 0, quest = 0, withSteps = 0, located = 0, withTarget = 0;
const fixedByDisambig = [];
const noSteps = [];

for (const gid of QUEST_GROUPS) {
  const stat = data.stats.find((s) => s.id === gid);
  if (!stat) continue;
  const items = stat.items.filter((i) => i.label);
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    // pede o título e a variante "(Quest)": quando a quest tem o nome de um
    // item ("Gleeok Guts"), o título puro é a página do ITEM
    const pages = await fetchPages(chunk.flatMap((it) => [it.label, `${it.label} (Quest)`]));
    for (const it of chunk) {
      total++;
      let page = pages[it.label];
      const alt = pages[`${it.label} (Quest)`];
      if ((!page || !hasQuestBox(page.content)) && alt && hasQuestBox(alt.content)) {
        page = alt;
        fixedByDisambig.push(`${it.label} -> ${alt.title}`);
      }
      const entry = { group: gid, wikiTitle: page?.title ?? null };
      if (page && hasQuestBox(page.content)) {
        quest++;
        entry.giver = infoboxField(page.content, 'giver') || undefined;
        entry.location = infoboxField(page.content, 'location') || undefined;
        entry.reward = rewardOf(page.content) || undefined;
        const steps = objectivesOf(page.content);
        if (steps.length) { entry.steps = steps; withSteps++; } else {
          entry.summary = overviewOf(page.content) || undefined;
          noSteps.push(it.label);
        }
        const start = entry.location ? places.get(norm(entry.location.split(',')[0])) : undefined;
        if (start) { entry.x = start.x; entry.z = start.z; entry.layer = start.layer; located++; }
        const targets = targetsOf([...(steps ?? []), entry.summary ?? ''], entry.location);
        if (targets.length) { entry.targets = targets; withTarget++; }
      }
      out[`${gid}:${it.id}`] = entry;
    }
    await new Promise((r) => setTimeout(r, 400)); // gentileza com a wiki
  }
}

writeFileSync(join(ROOT, 'app/public/data/quest_info.json'), JSON.stringify(out));
console.log(`quests: ${total} | pagina de quest certa: ${quest} | com passos do diario: ${withSteps} | com local de inicio no mapa: ${located} | com destino citado no mapa: ${withTarget}`);
console.log(`corrigidas pela variante "(Quest)": ${fixedByDisambig.length}`);
fixedByDisambig.forEach((x) => console.log('   ' + x));
console.log(`sem passos (usa resumo): ${noSteps.length}`);
noSteps.slice(0, 10).forEach((x) => console.log('   ' + x));
