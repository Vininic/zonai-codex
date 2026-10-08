// Gera app/public/data/quest_info.json: pra cada quest do dataset, quem dá,
// onde, recompensa, um resumo curto e — quando o local bate com uma localidade
// conhecida — a coordenada, pra quest aparecer no mapa do relatório.
//
// Fonte: Zelda Wiki (zeldawiki.wiki), MediaWiki com API aberta. O Zelda
// Dungeon seria a escolha natural, mas fica atrás de Cloudflare (API
// inacessível) e manda X-Frame-Options: SAMEORIGIN (não dá pra embutir);
// pra ele o app só oferece link.
//
// Gerado em build e não em runtime pra funcionar offline e não bater na
// wiki a cada abertura do relatório no celular.
//
// Uso: node scripts/build-quest-info.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const API = 'https://zeldawiki.wiki/w/api.php';
const QUEST_GROUPS = ['quests_main', 'quests_side', 'quests_adventure', 'quests_shrine'];

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
    if (!name || /^0x[0-9a-f]+$/i.test(name) || /^Well_\d+/.test(name)) continue;
    const k = norm(name);
    // primeira ocorrência vence; localidades gerais costumam vir primeiro
    if (!places.has(k)) places.set(k, { x: it.x, z: it.z, layer: it.layer ?? 'surface', name });
  }
}

// ---- limpeza de wikitext ----
function stripWiki(s) {
  let out = s;
  // templates aninhados: remove de dentro pra fora
  for (let i = 0; i < 6; i++) out = out.replace(/\{\{[^{}]*\}\}/g, (m) => {
    // {{Color TotK|Red|texto}} e parecidos: mantém o último argumento legível
    const parts = m.slice(2, -2).split('|');
    if (/^(Color|Term|Plural|Big|Small)/i.test(parts[0])) return parts[parts.length - 1];
    return '';
  });
  out = out.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '');
  out = out.replace(/<[^>]+>/g, '');
  out = out.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  out = out.replace(/'''?/g, '');
  return out.replace(/\s+/g, ' ').trim();
}

function infoboxField(text, field) {
  const m = text.match(new RegExp(`\\n\\|\\s*${field}\\s*=([^\\n]*)`));
  return m ? stripWiki(m[1]) : '';
}

function rewardOf(text) {
  const m = text.match(/\n\|\s*reward\s*=([\s\S]*?)\n\|\s*\w+\s*=/);
  if (!m) return '';
  const items = [...m[1].matchAll(/\*\s*([^\n]+)/g)].map((x) => stripWiki(x[1])).filter(Boolean);
  return items.length ? items.join(', ') : stripWiki(m[1]);
}

function overviewOf(text) {
  const m = text.match(/==\s*Overview\s*==\s*\n([\s\S]*?)(\n==|$)/);
  if (!m) return '';
  const para = m[1].split(/\n\s*\n/).map((p) => stripWiki(p)).find((p) => p.length > 40) ?? '';
  return para.length > 360 ? para.slice(0, 357).replace(/\s\S*$/, '') + '…' : para;
}

// ---- busca em lotes de 50 títulos ----
async function fetchBatch(titles) {
  const url =
    `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&redirects=1&format=json` +
    `&titles=${encodeURIComponent(titles.join('|'))}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'zonai-codex/1.0 (completion tracker; build script)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const redirectOf = new Map();
  for (const n of j.query?.normalized ?? []) redirectOf.set(n.to, n.from);
  for (const rd of j.query?.redirects ?? []) redirectOf.set(rd.to, redirectOf.get(rd.from) ?? rd.from);
  const pages = {};
  for (const p of Object.values(j.query?.pages ?? {})) {
    if (p.missing !== undefined) continue;
    const content = p.revisions?.[0]?.slots?.main?.['*'] ?? p.revisions?.[0]?.['*'] ?? '';
    const asked = redirectOf.get(p.title) ?? p.title;
    pages[asked] = { title: p.title, content };
  }
  return pages;
}

const out = {};
let hit = 0, located = 0, total = 0;
const unlocated = [];

for (const gid of QUEST_GROUPS) {
  const stat = data.stats.find((s) => s.id === gid);
  if (!stat) continue;
  const items = stat.items.filter((i) => i.label);
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const pages = await fetchBatch(chunk.map((it) => it.label));
    for (const it of chunk) {
      total++;
      const page = pages[it.label];
      const entry = { group: gid, wikiTitle: page?.title ?? null };
      if (page) {
        hit++;
        entry.giver = infoboxField(page.content, 'giver') || undefined;
        entry.location = infoboxField(page.content, 'location') || undefined;
        entry.reward = rewardOf(page.content) || undefined;
        entry.summary = overviewOf(page.content) || undefined;
        const place = entry.location ? places.get(norm(entry.location.split(',')[0])) : undefined;
        if (place) {
          entry.x = Math.round(place.x);
          entry.z = Math.round(place.z);
          entry.layer = place.layer;
          located++;
        } else if (entry.location) {
          unlocated.push(`${it.label} -> "${entry.location}"`);
        }
      }
      // chave grupo:id — o dataset reusa "quest-001" em main/side/adventure/
      // shrine, e chavear só pelo id fazia o último grupo sobrescrever os outros
      out[`${gid}:${it.id}`] = entry;
    }
    await new Promise((r) => setTimeout(r, 400)); // gentileza com a wiki
  }
}

writeFileSync(join(ROOT, 'app/public/data/quest_info.json'), JSON.stringify(out));
console.log(`quests: ${total} | na wiki: ${hit} | com coordenada: ${located}`);
console.log(`sem coordenada (local nao bate com localidade conhecida): ${unlocated.length}`);
unlocated.slice(0, 15).forEach((u) => console.log('   ' + u));
