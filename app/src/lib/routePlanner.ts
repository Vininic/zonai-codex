import type { CompletionData } from './dataset'
import type { Progress, RouteStep } from '../store/appStore'
import { itemLabel } from './itemLabel'

/**
 * Planejador de rota v2 — com teleporte.
 *
 * O planner v1 (`planner.ts`) era vizinho-mais-próximo sobre todos os pendentes,
 * o que trata o mapa como um caixeiro-viajante puro: uma linha só, andando de um
 * ponto ao próximo. Mas em TOTK isso está errado no modelo — você teleporta de
 * graça pra QUALQUER santuário/torre/raiz-luminosa já desbloqueado. Uma rota que
 * atravessa Hyrule a pé entre dois alvos distantes é sempre pior do que teleportar
 * pro ponto liberado mais perto do segundo e andar o trecho curto.
 *
 * Então o problema real é: particionar os alvos em torno dos pontos de teleporte
 * já desbloqueados, e resolver um TSP pequeno *dentro* de cada agrupamento.
 *
 *   1. alvos  = itens pendentes das categorias escolhidas, na camada
 *   2. âncoras = santuários/torres/raízes JÁ concluídos, na mesma camada
 *   3. cada alvo é atribuído à âncora mais próxima  → agrupamentos
 *   4. dentro do agrupamento: tour vizinho-mais-próximo a partir da âncora,
 *      depois refinado com 2-opt (troca de arestas até não melhorar mais)
 *   5. as pernas são encadeadas partindo da posição do player
 *
 * Tudo determinístico e offline — a IA não participa de nenhuma etapa.
 */

export interface RouteAnchor {
  categoryId: string
  label: string
  x: number
  z: number
}

export interface RouteLeg {
  /** ponto de teleporte que abre a perna; null = já começa a pé, do player */
  anchor: RouteAnchor | null
  stops: RouteStep[]
  /** distância a pé dentro da perna, em unidades do mapa (~metros no jogo) */
  walk: number
}

export interface OptimizedRoute {
  layer: string
  legs: RouteLeg[]
  /** rota achatada, na ordem de visita — é o que o mapa desenha */
  stops: RouteStep[]
  /** soma das distâncias a pé (não conta os teleportes, que são de graça) */
  totalWalk: number
  /** quanto seria a pé visitando as MESMAS paradas sem teleportar nenhuma vez —
   *  é a régua que mostra o que o agrupamento por teleporte economizou */
  naiveWalk: number
  /** pendentes no total, incluindo os que não couberam no cap */
  pendingTotal: number
}

/** categorias que funcionam como ponto de viagem rápida quando concluídas */
const TELEPORT_CATEGORIES = ['shrines', 'towers', 'lightroots']

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

const isDone = (manual: Progress, fromSave: Progress, groupId: string, itemId: string) =>
  !!(manual[groupId]?.[itemId] || fromSave[groupId]?.[itemId])

/** pontos de viagem rápida já desbloqueados na camada */
export function collectAnchors(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  layer: string,
): RouteAnchor[] {
  const anchors: RouteAnchor[] = []
  for (const cat of data.categories) {
    if (!TELEPORT_CATEGORIES.includes(cat.id)) continue
    for (const item of cat.items) {
      if ((item.layer ?? 'surface') !== layer) continue
      if (!isDone(manual, fromSave, cat.id, item.id)) continue
      anchors.push({ categoryId: cat.id, label: itemLabel(item), x: item.x, z: item.z })
    }
  }
  return anchors
}

/** comprimento total de um caminho aberto que começa em `start` */
function pathLength(start: { x: number; z: number }, tour: RouteStep[]): number {
  let total = 0
  let cur: { x: number; z: number } = start
  for (const s of tour) {
    total += dist(cur, s)
    cur = s
  }
  return total
}

/**
 * 2-opt: enquanto existir um par de arestas que, invertido, encurta o caminho,
 * aplica a inversão. Converge rápido nos tamanhos que usamos (≤ ~12 paradas por
 * perna) e tira exatamente os cruzamentos que o vizinho-mais-próximo deixa.
 */
function twoOpt(start: { x: number; z: number }, tour: RouteStep[]): RouteStep[] {
  if (tour.length < 4) return tour
  let best = [...tour]
  let bestLen = pathLength(start, best)
  let improved = true
  let guard = 0
  while (improved && guard++ < 40) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)]
        const len = pathLength(start, candidate)
        if (len < bestLen - 1e-6) {
          best = candidate
          bestLen = len
          improved = true
        }
      }
    }
  }
  return best
}

/** tour guloso: sempre o pendente mais próximo do ponto atual */
function nearestNeighbour(start: { x: number; z: number }, pool: RouteStep[]): RouteStep[] {
  const remaining = [...pool]
  const tour: RouteStep[] = []
  let cur: { x: number; z: number } = start
  while (remaining.length) {
    let bestIdx = 0
    let bestD = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(cur, remaining[i])
      if (d < bestD) {
        bestD = d
        bestIdx = i
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]
    tour.push(next)
    cur = next
  }
  return tour
}

export interface OptimizeOptions {
  categories: ReadonlySet<string>
  layer: string
  origin: { x: number; z: number } | null
  /** teto de paradas na rota inteira */
  maxStops?: number
  /** teto de paradas por perna (uma perna = um teleporte + caminhada) */
  maxPerLeg?: number
  /** restringe os alvos a uma caixa do mapa (usado no plano de região) */
  bounds?: { x1: number; x2: number; z1: number; z2: number }
}

export function optimizeRoute(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  opts: OptimizeOptions,
): OptimizedRoute {
  const maxStops = opts.maxStops ?? 24
  const maxPerLeg = opts.maxPerLeg ?? 8

  // 1. alvos pendentes
  const targets: RouteStep[] = []
  for (const cat of data.categories) {
    if (!opts.categories.has(cat.id)) continue
    for (const item of cat.items) {
      if ((item.layer ?? 'surface') !== opts.layer) continue
      if (isDone(manual, fromSave, cat.id, item.id)) continue
      const b = opts.bounds
      if (b && (item.x < b.x1 || item.x > b.x2 || item.z < b.z1 || item.z > b.z2)) continue
      targets.push({
        groupId: cat.id,
        itemId: item.id,
        label: itemLabel(item),
        x: item.x,
        z: item.z,
        layer: opts.layer,
      })
    }
  }
  const pendingTotal = targets.length
  if (!pendingTotal) return { layer: opts.layer, legs: [], stops: [], totalWalk: 0, naiveWalk: 0, pendingTotal: 0 }

  // 2. âncoras de teleporte já liberadas
  const anchors = collectAnchors(data, manual, fromSave, opts.layer)
  const origin = opts.origin

  // 3. agrupa cada alvo na âncora mais próxima (ou no player, se ele estiver
  //    mais perto que qualquer âncora — evita mandar teleportar pra andar menos)
  type Cluster = { anchor: RouteAnchor | null; targets: RouteStep[] }
  const byAnchor = new Map<string, Cluster>()
  const playerCluster: Cluster = { anchor: null, targets: [] }

  for (const target of targets) {
    let bestAnchor: RouteAnchor | null = null
    let bestD = origin ? dist(origin, target) : Infinity
    for (const a of anchors) {
      const d = dist(a, target)
      if (d < bestD) {
        bestD = d
        bestAnchor = a
      }
    }
    if (!bestAnchor) {
      playerCluster.targets.push(target)
      continue
    }
    const key = `${bestAnchor.x},${bestAnchor.z}`
    const cluster = byAnchor.get(key) ?? { anchor: bestAnchor, targets: [] }
    cluster.targets.push(target)
    byAnchor.set(key, cluster)
  }

  const clusters = [...byAnchor.values()]
  if (playerCluster.targets.length) clusters.unshift(playerCluster)

  // 4/5. resolve as pernas.
  //
  // Um agrupamento pode ter mais alvos do que cabe numa perna (`maxPerLeg`), e
  // nesse caso ele rende VÁRIAS pernas — você teleporta pra mesma âncora de novo
  // depois de esvaziar a bolsa. Por isso o laço consome de uma lista mutável em
  // vez de passar uma vez por agrupamento: a versão de passe único descartava
  // silenciosamente o excedente (num save real, 11 alvos numa âncora viravam 8
  // roteados e 3 sumiam, mesmo sobrando espaço no teto global).
  const legs: RouteLeg[] = []
  const stops: RouteStep[] = []
  let cursor = origin ?? clusters[0]?.anchor ?? { x: 0, z: 0 }
  const remaining = clusters.map((c) => ({ anchor: c.anchor, targets: [...c.targets] }))

  while (stops.length < maxStops) {
    // agrupamentos densos primeiro: mais itens por teleporte = menos loading
    const cluster = remaining
      .filter((c) => c.targets.length > 0)
      .sort((a, b) => {
        if (!a.anchor) return -1
        if (!b.anchor) return 1
        return b.targets.length - a.targets.length
      })[0]
    if (!cluster) break

    const room = Math.min(maxPerLeg, maxStops - stops.length)
    const start = cluster.anchor ?? cursor

    // leva os `room` alvos mais próximos da âncora e devolve o resto pro pool —
    // não adianta refinar uma ordem que vai ser truncada depois
    cluster.targets.sort((a, b) => dist(start, a) - dist(start, b))
    const near = cluster.targets.splice(0, room)
    if (!near.length) continue

    const tour = twoOpt(start, nearestNeighbour(start, near))
    // marca a primeira parada da perna: quem consome a rota achatada (o mapa
    // grande) precisa saber onde houve teleporte pra não ligar os dois a pé
    if (tour.length) tour[0] = { ...tour[0], legStart: !!cluster.anchor }
    legs.push({ anchor: cluster.anchor, stops: tour, walk: pathLength(start, tour) })
    stops.push(...tour)
    cursor = tour[tour.length - 1]
  }

  // régua: as mesmas paradas, visitadas a pé em ordem gulosa, sem teleportar
  const naiveStart = origin ?? stops[0] ?? { x: 0, z: 0 }
  const naiveWalk = pathLength(naiveStart, nearestNeighbour(naiveStart, stops))

  return {
    layer: opts.layer,
    legs,
    stops,
    totalWalk: legs.reduce((sum, l) => sum + l.walk, 0),
    naiveWalk,
    pendingTotal,
  }
}
