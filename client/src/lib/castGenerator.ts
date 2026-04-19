import type { Agent } from '@villa-ai/shared'

const FIRST_NAMES = [
  'Aaliyah', 'Aiden', 'Amara', 'Blake', 'Brielle', 'Caleb', 'Camila', 'Dante',
  'Demi', 'Elena', 'Ethan', 'Freya', 'Gianni', 'Hailey', 'Hugo', 'Imani',
  'Jade', 'Jaxon', 'Kaia', 'Kendall', 'Levi', 'Lila', 'Malik', 'Mia',
  'Nadia', 'Noah', 'Olive', 'Omar', 'Paige', 'Quinn', 'Raven', 'Rio',
  'Sage', 'Sienna', 'Tate', 'Valentina', 'Wren', 'Xander', 'Yara', 'Zion',
  'Aria', 'Bodhi', 'Cleo', 'Dax', 'Eden', 'Finn', 'Gemma', 'Harlow',
  'Iris', 'Jett', 'Kira', 'Lennox', 'Maren', 'Nico', 'Octavia', 'Phoenix',
]

const ARCHETYPES = [
  'the romantic', 'the strategist', 'the wildcard', 'the peacemaker',
  'the villain', 'the underdog', 'the charmer', 'the loyalist',
  'the chaos agent', 'the brooder', 'the bombshell', 'the comedian',
  'the empath', 'the competitor', 'the social butterfly', 'the dark horse',
]

const PERSONALITY_TEMPLATES = [
  'Wears their heart on their sleeve — emotional and impulsive. Falls fast, forgives faster. Their biggest weakness is trusting too easily.',
  'Plays the long game. Reads every room before making a move. Strategic but risks coming off as cold if they calculate too visibly.',
  'Zero filter, maximum chaos. Says what everyone else is thinking. Either the life of the party or the reason someone\'s crying.',
  'Natural mediator who keeps the peace — until someone crosses their ride-or-die. Then they go full scorched earth.',
  'Confident to the point of cocky. Believes they\'re the main character. When they flirt, they flirt hard — no half measures.',
  'The quiet one who watches everything. Observant, thoughtful, and devastating when they finally decide to speak up.',
  'Effortlessly likeable. Makes everyone feel special, which is exactly why nobody trusts their intentions.',
  'Competitive about everything — even love. Treats the villa like a game they refuse to lose.',
  'Deeply loyal once committed but agonizingly slow to commit. Overthinks every move and second-guesses every feeling.',
  'The provocateur. Stirs the pot not from malice but because they genuinely believe drama reveals truth.',
  'All sunshine on the surface, sharp instincts underneath. Uses humor and warmth as both a weapon and a shield.',
  'Magnetic and mysterious. Everyone wants to crack the code but they reveal themselves only on their own terms.',
]

const VOICE_STYLES = [
  'loud and unapologetic, drops slang freely, punctuates with "innit" and "literally"',
  'soft-spoken but deadly honest, pauses before delivering brutal truths',
  'rapid-fire energy, bounces between topics, infectious laugh',
  'smooth and deliberate, picks words carefully, flirtatious undertones',
  'self-deprecating humor, sarcastic one-liners, surprisingly vulnerable when caught off guard',
  'warm and encouraging, gives nicknames to everyone, maternal/paternal energy',
  'dramatic AF — gasps, whispers, wide eyes — everything is breaking news',
  'cool and collected, rarely raises voice, devastating one-word responses',
  'excitable storyteller, tangents and sound effects, pulls everyone into their energy',
  'blunt Northern/Southern charm, says "babe" constantly, no patience for mind games',
]

const JOBS = [
  'personal trainer', 'beauty influencer', 'estate agent', 'barista',
  'dental nurse', 'DJ', 'model', 'PE teacher', 'recruitment consultant',
  'microbiologist', 'content creator', 'chef', 'firefighter', 'bartender',
  'fashion designer', 'physiotherapist', 'pilot', 'tattoo artist',
  'software engineer', 'yacht steward', 'club promoter', 'pharmacist',
]

const CITIES = [
  'London', 'Manchester', 'Dublin', 'Glasgow', 'Birmingham', 'Cardiff',
  'Newcastle', 'Liverpool', 'Bristol', 'Leeds', 'Brighton', 'Edinburgh',
  'Belfast', 'Nottingham', 'Sheffield', 'Essex', 'Devon', 'Kent',
]

const REASONS = [
  'they\'re tired of talking stages that go nowhere',
  'their ex told them they\'d never find better — and they\'re out to prove them wrong',
  'their friends signed them up and honestly it was the best decision anyone\'s ever made for them',
  'they want to prove that real connections can start in the wildest places',
  'they\'re looking for someone who matches their energy — and nobody back home cuts it',
  'they crave adventure and figured why not fall in love on TV while they\'re at it',
]

const HAIR_STYLES = [
  '~(@ @)~', '~{@ @}~', '\\(@_@)/', '~<@ @>~', '~[O O]~', '~(* *)~',
  '~{o o}~', '\\(^ ^)/', '~<O O>~', '~[* *]~', '~(> <)~', '~{^ ^}~',
  '\\(@ @)\\', '~<* *>~', '~[@ @]~', '~(o o)~',
]

const EMOJI_FACES = [
  '😎', '🤩', '😏', '🥰', '😤', '🤪', '😈', '🤭',
  '😁', '🫠', '💅', '🔥', '✨', '🦋', '🌹', '💎',
]

const COLOR_CLASSES = [
  'text-pink-400', 'text-sky-400', 'text-fuchsia-400', 'text-emerald-400',
  'text-amber-400', 'text-indigo-400', 'text-rose-400', 'text-teal-400',
  'text-orange-400', 'text-violet-400', 'text-yellow-400', 'text-cyan-400',
  'text-lime-400', 'text-red-400', 'text-purple-400', 'text-blue-400',
]

// Archetype families — opposites attract for drama, same-family = low compatibility
const ARCHETYPE_FAMILIES: Record<string, string> = {
  'the romantic': 'emotional',
  'the empath': 'emotional',
  'the loyalist': 'emotional',
  'the strategist': 'strategic',
  'the competitor': 'strategic',
  'the dark horse': 'strategic',
  'the wildcard': 'chaotic',
  'the chaos agent': 'chaotic',
  'the villain': 'chaotic',
  'the charmer': 'social',
  'the social butterfly': 'social',
  'the comedian': 'social',
  'the brooder': 'reserved',
  'the underdog': 'reserved',
  'the peacemaker': 'reserved',
  'the bombshell': 'social',
}

// Cross-family compatibility: how well do these family combos match?
const FAMILY_COMPAT: Record<string, Record<string, number>> = {
  emotional:  { emotional: 25, strategic: 65, chaotic: 45, social: 55, reserved: 70 },
  strategic:  { emotional: 65, strategic: 20, chaotic: 55, social: 40, reserved: 50 },
  chaotic:    { emotional: 45, strategic: 55, chaotic: 15, social: 60, reserved: 70 },
  social:     { emotional: 55, strategic: 40, chaotic: 60, social: 30, reserved: 65 },
  reserved:   { emotional: 70, strategic: 50, chaotic: 70, social: 65, reserved: 20 },
}

export function baseCompatibility(archetypeA: string, archetypeB: string): number {
  const famA = ARCHETYPE_FAMILIES[archetypeA] ?? 'social'
  const famB = ARCHETYPE_FAMILIES[archetypeB] ?? 'social'
  return FAMILY_COMPAT[famA]?.[famB] ?? 40
}

// Voice examples for prompt differentiation
export const VOICE_EXAMPLES: Record<string, string> = {
  'loud and unapologetic': "Absolutely NOT, are you having a LAUGH? That's bare disrespectful, innit!",
  'soft-spoken but deadly honest': "I just think... you should know... she said she doesn't see a future with you.",
  'rapid-fire energy': "OhmyGOD wait wait wait — did you see his FACE when she walked in? I'm DEAD!",
  'smooth and deliberate': "I've been watching you all evening. And I think... you already know what I'm going to say.",
  'self-deprecating humor': "Right, so I tried to be smooth and I tripped over a sunbed. Classic me, honestly.",
  'warm and encouraging': "Babe, honestly? You deserve the world. And if he can't see that, that's HIS loss, yeah?",
  'dramatic AF': "*gasps* Wait. WAIT. Did she just say that? To HIS face? Oh my days, I need to sit down.",
  'cool and collected': "Interesting.",
  'excitable storyteller': "So THEN — and this is the mad part right — she turns around and goes 'I never liked you anyway!' and I'm stood there like—",
  'blunt Northern/Southern charm': "Babe, I'm gonna be straight with you. I fancy someone else. No point dragging it out, is there?",
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function pickUnique<T>(arr: T[], used: Set<T>): T {
  const available = arr.filter((x) => !used.has(x))
  if (available.length === 0) return pick(arr)
  return pick(available)
}

function generateId(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '') + Math.floor(Math.random() * 900 + 100)
}

export function generateCast(count: number, existingIds: string[] = []): Agent[] {
  const usedNames = new Set<string>()
  const usedColors = new Set<string>()
  const usedIds = new Set(existingIds)
  const agents: Agent[] = []

  for (let i = 0; i < count; i++) {
    const name = pickUnique(FIRST_NAMES, usedNames)
    usedNames.add(name)
    const age = 21 + Math.floor(Math.random() * 10)
    const archetype = pick(ARCHETYPES)
    const personality = pick(PERSONALITY_TEMPLATES)
    const voice = pick(VOICE_STYLES)
    const job = pick(JOBS)
    const city = pick(CITIES)
    const reason = pick(REASONS)
    const bio = `${name} is a ${age}-year-old ${job} from ${city}. They came to the villa because ${reason}.`
    const hairAscii = pick(HAIR_STYLES)
    const emojiFace = pick(EMOJI_FACES)
    const colorClass = pickUnique(COLOR_CLASSES, usedColors)
    usedColors.add(colorClass)

    let id = generateId(name)
    while (usedIds.has(id)) {
      id = generateId(name)
    }
    usedIds.add(id)

    agents.push({
      id,
      name,
      age,
      archetype,
      emojiFace,
      hairAscii,
      personality,
      voice,
      bio,
      colorClass,
    })
  }

  return agents
}

export function generateBombshells(count: number, mainCastIds: string[]): Agent[] {
  return generateCast(count, mainCastIds)
}
