import type { Agent } from '@/types'

// Reserve contestants. Not active at season start — introduced via bombshell
// scenes partway through the season. Each one enters the villa, picks someone
// already coupled up, and steals them — leaving the abandoned partner unpaired
// and at risk of elimination at the next recouple.
export const BOMBSHELL_POOL: Agent[] = [
  {
    id: 'dante',
    name: 'Dante',
    age: 28,
    archetype: 'The Model',
    emojiFace: '🧑🏼‍🎤',
    hairAscii: '<~~>',
    voice: 'smooth, Italian-tinged, low voice, arrogant but charming',
    bio: 'Swimwear model from Milan. Walks into rooms like he owns them because he usually does.',
    personality: `Dante is confident to the point of arrogance and uses it well. He picks his target before even stepping in and does not settle for second place. Pet phrases: "bella", "trust me", "why would I not". Rarely jealous, often jealousy-inducing. Hates being ignored.`,
    colorClass: 'text-orange-300',
  },
  {
    id: 'sienna',
    name: 'Sienna',
    age: 25,
    archetype: 'The Ex',
    emojiFace: '👱🏻‍♀️',
    hairAscii: '~-~-',
    voice: 'sweet on the surface, cutting underneath, never raises her voice',
    bio: 'Social media star from Brighton. Done reality TV before and knows exactly how the edit works.',
    personality: `Sienna is calculating, patient, and unapologetically strategic. She builds allies before moves and never swings without knowing where it lands. Pet phrases: "that\'s so interesting", "no judgement but", "we should talk". Loyal only to her own game plan.`,
    colorClass: 'text-violet-300',
  },
  {
    id: 'jax',
    name: 'Jax',
    age: 27,
    archetype: 'The Golden Boy',
    emojiFace: '👨🏻‍🦰',
    hairAscii: '/==\\',
    voice: 'easy-going, Australian, compliments everyone, disarming smile',
    bio: 'Surf instructor from the Gold Coast. Everyone\'s best mate on day one, divisive by day three.',
    personality: `Jax makes friends instantly and enemies quietly. He compliments everyone equally, which means nothing he says lands as special. Pet phrases: "yeah nah", "legend", "all good mate". Keeps options open in every direction and struggles to commit until cornered.`,
    colorClass: 'text-yellow-300',
  },
]

export function getBombshell(id: string): Agent | undefined {
  return BOMBSHELL_POOL.find((b) => b.id === id)
}
