import type { CompletionData } from './dataset'
import type { Progress } from '../store/appStore'

/**
 * Estado de um relatório embutido na própria URL.
 *
 * O problema real: o save fica no desktop e o relatório é pra ler no celular,
 * e não existe conta/nuvem pra sincronizar. Mandar um .html de 300 KB pro
 * telefone é trabalhoso e abre mal. Mas o celular já tem o dataset inteiro ao
 * abrir o site — a única coisa que falta é *o que você ainda não pegou*.
 *
 * Então mandamos só isso: um bit por item, na ordem do dataset. 1161 itens
 * dos seis grupos viram ~196 caracteres, que cabem numa URL sem esforço. O
 * resto (nomes, coordenadas, rota) o celular recalcula sozinho.
 *
 * `V` muda junto com qualquer mudança de ordem/conteúdo do dataset: um link
 * antigo decodificaria bits contra outra lista e apontaria itens errados, o
 * que é pior que não abrir.
 */
const V = '1'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function toBase64url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)]
    if (i + 1 < bytes.length) out += B64[((b & 15) << 2) | (c >> 6)]
    if (i + 2 < bytes.length) out += B64[c & 63]
  }
  return out
}

function fromBase64url(s: string): Uint8Array {
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of s) {
    const v = B64.indexOf(ch)
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** itens de um grupo, seja categoria (com mapa) ou stat (checklist) */
function groupItems(data: CompletionData, id: string): { id: string }[] {
  return data.categories.find((c) => c.id === id)?.items ?? data.stats.find((s) => s.id === id)?.items ?? []
}

/**
 * Empacota "o que falta" dos grupos pedidos. Bit 1 = pendente.
 * Formato: `1.grupo1~grupo2.<bits em base64url>`
 */
export function encodeReportState(
  data: CompletionData,
  manual: Progress,
  fromSave: Progress,
  groupIds: string[],
): string {
  const flags: boolean[] = []
  for (const gid of groupIds) {
    const m = manual[gid] ?? {}
    const s = fromSave[gid] ?? {}
    for (const item of groupItems(data, gid)) flags.push(!m[item.id] && !s[item.id])
  }
  const bytes = new Uint8Array(Math.ceil(flags.length / 8))
  flags.forEach((on, i) => {
    if (on) bytes[i >> 3] |= 1 << (i & 7)
  })
  return `${V}.${groupIds.join('~')}.${toBase64url(bytes)}`
}

export interface DecodedReport {
  groupIds: string[]
  /** groupId -> Set de itemIds que ainda faltam */
  pending: Map<string, Set<string>>
}

/** devolve null quando o link é de outra versão do dataset ou está truncado */
export function decodeReportState(data: CompletionData, payload: string): DecodedReport | null {
  const dot = payload.indexOf('.')
  const dot2 = payload.indexOf('.', dot + 1)
  if (dot < 0 || dot2 < 0) return null
  if (payload.slice(0, dot) !== V) return null
  const groupIds = payload.slice(dot + 1, dot2).split('~').filter(Boolean)
  const bytes = fromBase64url(payload.slice(dot2 + 1))

  const expected = groupIds.reduce((n, gid) => n + groupItems(data, gid).length, 0)
  if (bytes.length < Math.ceil(expected / 8)) return null

  const pending = new Map<string, Set<string>>()
  let i = 0
  for (const gid of groupIds) {
    const set = new Set<string>()
    for (const item of groupItems(data, gid)) {
      if ((bytes[i >> 3] >> (i & 7)) & 1) set.add(item.id)
      i++
    }
    pending.set(gid, set)
  }
  return { groupIds, pending }
}
