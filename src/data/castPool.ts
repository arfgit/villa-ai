import type { Agent } from '@/types'
import { generateCast, generateBombshells } from '@/lib/castGenerator'

const SEASON_SIZE = 8
const BOMBSHELL_PER_SEASON = 5  // more bombshells to keep the drama flowing

/**
 * Generate a fresh season's cast and bombshells using the procedural generator.
 * Every season gets unique characters with random names, archetypes, and traits.
 */
export function sampleSeasonCast(): { cast: Agent[]; bombshells: Agent[] } {
  const cast = generateCast(SEASON_SIZE)
  const bombshells = generateBombshells(BOMBSHELL_PER_SEASON, cast.map((c) => c.id))
  return { cast, bombshells }
}
