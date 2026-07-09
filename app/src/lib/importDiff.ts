import type { ImportDiff, PlayerDelta, Progress } from '../store/appStore'
import type { PlayerStats } from './saveParser'

/** diff item a item entre o save anterior e o recém-importado (mentalidade git) */
export function computeImportDiff(
  oldProgress: Progress,
  newProgress: Progress,
  oldPlayer: PlayerStats | null,
  newPlayer: PlayerStats,
  fromFile: string,
  toFile: string,
): ImportDiff {
  const groupIds = new Set([...Object.keys(oldProgress), ...Object.keys(newProgress)])
  const groups: ImportDiff['groups'] = []
  for (const groupId of groupIds) {
    const oldSet = oldProgress[groupId] ?? {}
    const newSet = newProgress[groupId] ?? {}
    const added = Object.keys(newSet).filter((id) => !oldSet[id])
    const removed = Object.keys(oldSet).filter((id) => !newSet[id])
    if (added.length || removed.length) groups.push({ groupId, added, removed })
  }
  groups.sort((a, b) => b.added.length + b.removed.length - (a.added.length + a.removed.length))

  const player: PlayerDelta[] = []
  if (oldPlayer) {
    const pairs: [PlayerDelta['key'], number, number][] = [
      ['rupees', oldPlayer.rupees, newPlayer.rupees],
      ['hearts', oldPlayer.hearts, newPlayer.hearts],
      ['stamina', oldPlayer.staminaWheels, newPlayer.staminaWheels],
      ['battery', oldPlayer.batteryCells, newPlayer.batteryCells],
    ]
    for (const [key, from, to] of pairs) if (from !== to) player.push({ key, from, to })
  }

  return { fromFile, toFile, at: new Date().toISOString(), groups, player }
}
