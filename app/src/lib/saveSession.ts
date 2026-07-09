/**
 * Buffer do save importado, vivo só em memória (não persiste reload):
 * editar/exportar exige um save importado nesta sessão.
 */
let current: { buffer: ArrayBuffer; fileName: string } | null = null

export function setSessionSave(buffer: ArrayBuffer, fileName: string) {
  current = { buffer, fileName }
}

export function getSessionSave() {
  return current
}

export function clearSessionSave() {
  current = null
}
