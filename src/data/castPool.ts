import type { Agent } from '@/types'
import { generateCast, generateBombshells } from '@/lib/castGenerator'

const SEASON_SIZE = 8
const BOMBSHELL_PER_SEASON = 5

export function sampleSeasonCast(): { cast: Agent[]; bombshells: Agent[] } {
  const cast = generateCast(SEASON_SIZE)
  const bombshells = generateBombshells(BOMBSHELL_PER_SEASON, cast.map((c) => c.id))
  return { cast, bombshells }
}
