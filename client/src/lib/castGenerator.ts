import type { Agent } from "@villa-ai/shared";

const FIRST_NAMES = [
  "Aaliyah",
  "Aiden",
  "Amara",
  "Blake",
  "Brielle",
  "Caleb",
  "Camila",
  "Dante",
  "Demi",
  "Elena",
  "Ethan",
  "Freya",
  "Gianni",
  "Hailey",
  "Hugo",
  "Imani",
  "Jade",
  "Jaxon",
  "Kaia",
  "Kendall",
  "Levi",
  "Lila",
  "Malik",
  "Mia",
  "Nadia",
  "Noah",
  "Olive",
  "Omar",
  "Paige",
  "Quinn",
  "Raven",
  "Rio",
  "Sage",
  "Sienna",
  "Tate",
  "Valentina",
  "Wren",
  "Xander",
  "Yara",
  "Zion",
  "Aria",
  "Bodhi",
  "Cleo",
  "Dax",
  "Eden",
  "Finn",
  "Gemma",
  "Harlow",
  "Iris",
  "Jett",
  "Kira",
  "Lennox",
  "Maren",
  "Nico",
  "Octavia",
  "Phoenix",
  "Callum",
  "Daisy",
  "Ezra",
  "Fleur",
  "Grayson",
  "Halle",
  "Isla",
  "Jonah",
  "Kiya",
  "Luca",
  "Marlowe",
  "Nia",
  "Otis",
  "Posie",
  "Rafferty",
  "Saskia",
  "Teo",
  "Ulysses",
  "Vida",
  "Winnie",
  "Xiomara",
  "Yusuf",
  "Zara",
  "Avi",
  "Briar",
];

const ARCHETYPES = [
  "the romantic",
  "the burnt-out romantic",
  "the plotting villain",
  "the accidental villain",
  "the proud villain",
  "the strategist",
  "the stealth competitor",
  "the wildcard",
  "the reformed wildcard",
  "the peacemaker",
  "the caretaker",
  "the underdog",
  "the charmer",
  "the quiet charmer",
  "the loyalist",
  "the ride-or-die",
  "the chaos agent",
  "the brooder",
  "the comedian",
  "the dry comedian",
  "the empath",
  "the competitor",
  "the social butterfly",
  "the dark horse",
  "the heartbreaker",
  "the skeptic",
  "the true believer",
  "the chameleon",
];

const CORE_VALUES = [
  "Loyalty is the whole personality — they pick a person and ride for them",
  "Chases validation harder than they'll ever admit",
  "Believes love only counts if it hurts a little",
  "Built their life around independence, resents needing anyone",
  "Treats honesty like a sport — scored by how uncomfortable it makes the room",
  "Spiritual but make it chaotic — reads tarot before every date",
  "Family-first to the point that every decision runs through their mum",
  "Freedom is non-negotiable, settling down terrifies them",
  "Ambition runs the show, even in the villa",
  "Moves through life like every moment is a story they'll tell later",
  "Soft on the inside, sharp edges by default",
  "Believes vibes never lie — trusts their gut over facts",
  "Competitive at heart, sees every friendship as a subtle race",
  "Hopeless romantic who refuses to call themselves one",
  "Curious about people — wants to know what makes everyone tick",
  "Logic-first type — feelings are a data point, not a compass",
  "Peacekeeper by reflex, even when the room needs someone to blow up",
  "Adrenaline-seeking — if it scares them, they're doing it",
  "Values status and will not apologize for it",
  "Takes pride in being the funniest person in every room",
  "Generosity is their love language — and sometimes a shield",
  "Needs to be seen, otherwise they spiral",
  "Believes they're a late bloomer and this is the moment",
  "Treats vulnerability like a weapon they deploy selectively",
];

const SOCIAL_MODES = [
  "Works the room, clocks everyone's dynamic in the first hour",
  "Life of the party for week one, quiet corner by week two",
  "Silent observer until they land a one-liner that resets the room",
  "Plays devil's advocate for sport",
  "Flirts as a love language, even with the bartender",
  "Glues the group together without ever making it about themselves",
  "Magnet for secrets — people tell them things they shouldn't",
  "Lone wolf energy with a soft spot for the underdog",
  "Sharp-elbowed in group settings, warm one-on-one",
  "Mothers the whole cast within 48 hours",
  "Cracks jokes to cover every uncomfortable pause",
  "Tests people before trusting them — overtly, awkwardly",
  "Takes up space loudly and refuses to apologize for it",
  "Holds court at dinner — stories get rehearsed mid-telling",
  "Observant listener who forgets to contribute",
  "Collects allies strategically, always knows who owes who",
  "Turns every hang into a confessional by 2 AM",
  "Dances with everyone, ends up leaving alone",
  "Gives advice they've never taken themselves",
  "Subtle shit-stirrer — asks innocent questions with sharp consequences",
  "Natural leader when a decision needs making, vanishes otherwise",
  "Reads the room so fast they answer questions nobody asked",
  "Picks a ride-or-die on day one, folds everyone else into tiers",
  "Charming on camera, blank-faced the moment it cuts",
];

const WEAKNESSES = [
  "Overthinks every text after the fact",
  "Spirals when they don't hear back within an hour",
  "Throws themselves into rebounds way too fast",
  "Keeps a mental scoreboard and brings it up months later",
  "Cannot take a compliment without deflecting",
  "Talks in therapy buzzwords to avoid actual feelings",
  "Jealous streak they absolutely believe doesn't exist",
  "Commits too fast, regrets out loud a week later",
  "Goes cold the second they feel exposed",
  "Will pick a fight to prove they're not boring",
  "Says they want feedback, cannot handle feedback",
  "Loses interest the moment someone else loses interest",
  "Gets drunk on being wanted, sobers up on being known",
  "Picks partners they know their mum will hate",
  "Compares every new person to a specific ex",
  "Stays in situations way past their shelf life",
  "Ghosts when anxious, reappears when lonely",
  "Believes their own hype a little too loudly",
  "People-pleases until they resent everyone",
  "Cannot be alone — dates through it",
  "Gets loud to avoid being quiet",
  "Takes small slights like full attacks",
];

const QUIRKS = [
  "Names every plant they own",
  "Cannot sit still during a phone call",
  "Rehearses comebacks in the shower",
  "Has a tell — touches their nose when lying",
  "Talks to their drink when nervous",
  "Keeps receipts. Literal paper receipts.",
  "Wakes up at 5:30 every day without an alarm",
  "Reads the cereal box on dates",
  "Bursts into song mid-argument",
  "Writes in a journal every night, shows nobody",
  "Treats horoscopes like calendar invites",
  "Snort-laughs when they actually find something funny",
  "Cooks elaborate meals nobody asked for",
  "Keeps a list of every boy or girl who ever wronged them",
  "Flirts by playfully insulting — always lands, sometimes misfires",
  "Collects souvenirs from every bad date",
  "Never drinks water, always has a Red Bull",
  "Rearranges furniture in their head during small talk",
  "Quotes movies like scripture",
  "Will not leave a room without saying goodbye to everyone individually",
  "Sleep-talks — allegedly has confessed crushes mid-sleep",
  "Always wearing something borrowed from a sibling",
  "Claims to be a night owl, passes out at 10",
  "Overuses one word per conversation cycle (most recently: 'stellar')",
  "Cries at weddings of people they don't know",
  "Holds eye contact a beat too long on purpose",
];

const BACKSTORY_HOOKS = [
  "Youngest of four siblings — used to getting talked over",
  "Just got out of a three-year relationship their friends all hated",
  "Raised by their gran; never met their dad",
  "Moved cities three times in two years chasing someone",
  "Had a famous ex that half the internet still asks about",
  "Dropped out of law school and hasn't told their parents",
  "Recently back from a solo year traveling Southeast Asia",
  "Still lives five minutes from the house they grew up in",
  "Came out to their family six months ago — it went fine, actually",
  "Was engaged at 22, called it off two weeks before the wedding",
  "Paid for uni themselves working nights at a casino",
  "Has a twin who's their opposite — best friends, obviously",
  "First-gen in their country; code-switches without thinking",
  "Grew up in a religious household, still working out what that means",
  "Survived a scary car accident at 19 — hasn't driven since",
  "Signed to a semi-pro football team before a knee injury ended it",
  "Raised two younger siblings after their parents split",
  "Ex moved on with their best mate — group chat never recovered",
  "Won a reality competition at 16 for a talent they don't do anymore",
  "Moved abroad for love at 20, moved back alone at 23",
  "Oldest sibling of a very large, very loud family",
  "Was the 'quiet one' at school, barely recognized themselves by 25",
  "Came out of a four-year situationship six months ago",
  "Dated their best friend for eight weeks and it nearly destroyed everything",
  "Has been on one other reality show — edited as the villain, swears it's unfair",
  "Supported their family financially from 18 onwards",
  "Grew up in foster care from 10 to 16 — ride-or-die to anyone who sticks",
  "Left a long-term engagement because they wanted to feel something again",
  "Recently inherited a small business and is terrified of failing at it",
  "Became the caretaker when their parent got sick at 15",
];

const VOICE_STYLES = [
  'loud and unapologetic, drops slang freely, punctuates with "innit" and "literally"',
  "soft-spoken but deadly honest, pauses before delivering brutal truths",
  "rapid-fire energy, bounces between topics, infectious laugh",
  "smooth and deliberate, picks words carefully, flirtatious undertones",
  "self-deprecating humor, sarcastic one-liners, surprisingly vulnerable when caught off guard",
  "warm and encouraging, gives nicknames to everyone, maternal/paternal energy",
  "dramatic AF — gasps, whispers, wide eyes — everything is breaking news",
  "cool and collected, rarely raises voice, devastating one-word responses",
  "excitable storyteller, tangents and sound effects, pulls everyone into their energy",
  'blunt Northern/Southern charm, says "babe" constantly, no patience for mind games',
  "poet's tempo, lyrical and layered, uses metaphors others have to decode",
  "game-show host energy, over-explains every joke, punchline-forward",
  "soft goth tone, dry doom-adjacent observations, deadpan delivery",
  "posh training with a casual-drop accent, elegant vocabulary in relaxed cadence",
  "oversharer — will tell you their ex's full name and postcode by hour one",
  "accidentally profound, speaks in earnest aphorisms they didn't mean to coin",
  "peak millennial, says emoji names out loud, irony as a reflex",
  "manic pixie energy, laughs mid-sentence, non-sequitur compliments",
];

const JOBS = [
  "personal trainer",
  "beauty influencer",
  "estate agent",
  "barista",
  "dental nurse",
  "DJ",
  "model",
  "PE teacher",
  "recruitment consultant",
  "microbiologist",
  "content creator",
  "chef",
  "firefighter",
  "bartender",
  "fashion designer",
  "physiotherapist",
  "pilot",
  "tattoo artist",
  "software engineer",
  "yacht steward",
  "club promoter",
  "pharmacist",
  "hair stylist",
  "paramedic",
  "semi-pro footballer",
  "wedding planner",
  "dog groomer",
  "tech recruiter",
  "trainee lawyer",
  "crane operator",
  "podcast producer",
  "insurance broker",
  "lifeguard",
  "nursery teacher",
  "sommelier",
  "paralegal",
  "private chef",
  "nutritionist",
  "primary school TA",
  "tow-truck operator",
];

const CITIES = [
  "London",
  "Manchester",
  "Dublin",
  "Glasgow",
  "Birmingham",
  "Cardiff",
  "Newcastle",
  "Liverpool",
  "Bristol",
  "Leeds",
  "Brighton",
  "Edinburgh",
  "Belfast",
  "Nottingham",
  "Sheffield",
  "Essex",
  "Devon",
  "Kent",
  "Aberdeen",
  "Swansea",
  "Cork",
  "Galway",
  "Portsmouth",
  "Southampton",
  "Oxford",
  "Reading",
  "Bath",
  "Coventry",
  "Milton Keynes",
  "Plymouth",
];

const REASONS = [
  "they're tired of talking stages that go nowhere",
  "their ex told them they'd never find better — and they're out to prove them wrong",
  "their friends signed them up and honestly it was the best decision anyone's ever made for them",
  "they want to prove that real connections can start in the wildest places",
  "they're looking for someone who matches their energy — and nobody back home cuts it",
  "they crave adventure and figured why not fall in love on TV while they're at it",
  "they just turned 30 and their group chat has become a wedding group chat",
  "they've been single for two years and the apps made them delete the apps",
  "they want something that's not a situationship for once in their life",
  "their last relationship made them realize how low the bar had gotten",
  "they're here because their sister told them they'd never have the guts",
  "they're chasing something they've never actually had — the real thing",
  "they're turning a new page and this villa is chapter one",
  "their last ex is on another dating show and they wanted to upstage them",
  "they miss feeling something — any kind of something",
];

const HAIR_STYLES = [
  "~(@ @)~",
  "~{@ @}~",
  "\\(@_@)/",
  "~<@ @>~",
  "~[O O]~",
  "~(* *)~",
  "~{o o}~",
  "\\(^ ^)/",
  "~<O O>~",
  "~[* *]~",
  "~(> <)~",
  "~{^ ^}~",
  "\\(@ @)\\",
  "~<* *>~",
  "~[@ @]~",
  "~(o o)~",
];

const EMOJI_FACES = [
  "😎",
  "🤩",
  "😏",
  "🥰",
  "😤",
  "🤪",
  "😈",
  "🤭",
  "😁",
  "🫠",
  "💅",
  "🔥",
  "✨",
  "🦋",
  "🌹",
  "💎",
];

const COLOR_CLASSES = [
  "text-pink-400",
  "text-sky-400",
  "text-fuchsia-400",
  "text-emerald-400",
  "text-amber-400",
  "text-indigo-400",
  "text-rose-400",
  "text-teal-400",
  "text-orange-400",
  "text-violet-400",
  "text-yellow-400",
  "text-cyan-400",
  "text-lime-400",
  "text-red-400",
  "text-purple-400",
  "text-blue-400",
];

const ARCHETYPE_FAMILIES: Record<string, string> = {
  "the romantic": "emotional",
  "the burnt-out romantic": "emotional",
  "the empath": "emotional",
  "the loyalist": "emotional",
  "the ride-or-die": "emotional",
  "the caretaker": "emotional",
  "the true believer": "emotional",
  "the strategist": "strategic",
  "the stealth competitor": "strategic",
  "the competitor": "strategic",
  "the dark horse": "strategic",
  "the skeptic": "strategic",
  "the chameleon": "strategic",
  "the wildcard": "chaotic",
  "the reformed wildcard": "chaotic",
  "the chaos agent": "chaotic",
  "the plotting villain": "chaotic",
  "the accidental villain": "chaotic",
  "the proud villain": "chaotic",
  "the heartbreaker": "chaotic",
  "the charmer": "social",
  "the quiet charmer": "social",
  "the social butterfly": "social",
  "the comedian": "social",
  "the dry comedian": "social",
  "the brooder": "reserved",
  "the underdog": "reserved",
  "the peacemaker": "reserved",
};

const FAMILY_COMPAT: Record<string, Record<string, number>> = {
  emotional: {
    emotional: 25,
    strategic: 65,
    chaotic: 45,
    social: 55,
    reserved: 70,
  },
  strategic: {
    emotional: 65,
    strategic: 20,
    chaotic: 55,
    social: 40,
    reserved: 50,
  },
  chaotic: {
    emotional: 45,
    strategic: 55,
    chaotic: 15,
    social: 60,
    reserved: 70,
  },
  social: {
    emotional: 55,
    strategic: 40,
    chaotic: 60,
    social: 30,
    reserved: 65,
  },
  reserved: {
    emotional: 70,
    strategic: 50,
    chaotic: 70,
    social: 65,
    reserved: 20,
  },
};

export function baseCompatibility(
  archetypeA: string,
  archetypeB: string,
): number {
  const famA = ARCHETYPE_FAMILIES[archetypeA] ?? "social";
  const famB = ARCHETYPE_FAMILIES[archetypeB] ?? "social";
  return FAMILY_COMPAT[famA]?.[famB] ?? 40;
}

export const VOICE_EXAMPLES: Record<string, string> = {
  "loud and unapologetic":
    "Absolutely NOT, are you having a LAUGH? That's bare disrespectful, innit!",
  "soft-spoken but deadly honest":
    "I just think... you should know... she said she doesn't see a future with you.",
  "rapid-fire energy":
    "OhmyGOD wait wait wait — did you see his FACE when she walked in? I'm DEAD!",
  "smooth and deliberate":
    "I've been watching you all evening. And I think... you already know what I'm going to say.",
  "self-deprecating humor":
    "Right, so I tried to be smooth and I tripped over a sunbed. Classic me, honestly.",
  "warm and encouraging":
    "Babe, honestly? You deserve the world. And if he can't see that, that's HIS loss, yeah?",
  "dramatic AF":
    "*gasps* Wait. WAIT. Did she just say that? To HIS face? Oh my days, I need to sit down.",
  "cool and collected": "Interesting.",
  "excitable storyteller":
    "So THEN — and this is the mad part right — she turns around and goes 'I never liked you anyway!' and I'm stood there like—",
  "blunt Northern/Southern charm":
    "Babe, I'm gonna be straight with you. I fancy someone else. No point dragging it out, is there?",
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickUnique<T>(arr: readonly T[], used: Set<T>): T {
  const available = arr.filter((x) => !used.has(x));
  if (available.length === 0) return pick(arr);
  return pick(available);
}

function generateId(name: string): string {
  return (
    name.toLowerCase().replace(/[^a-z]/g, "") +
    Math.floor(Math.random() * 900 + 100)
  );
}

function rollAge(): number {
  const r = Math.random();
  if (r < 0.03) return 19 + Math.floor(Math.random() * 2);
  if (r < 0.08) return 33 + Math.floor(Math.random() * 6);
  return 22 + Math.floor(Math.random() * 11);
}

function composePersonality(
  core: string,
  social: string,
  weakness: string,
  quirk: string,
): string {
  const joined = `${core}. ${social}. ${weakness}. ${quirk}.`;
  return joined.length > 360 ? joined.slice(0, 357) + "..." : joined;
}

function composeBio(
  name: string,
  age: number,
  job: string,
  city: string,
  hook: string,
  reason: string,
): string {
  return `${name} is a ${age}-year-old ${job} from ${city}. ${hook}. They came to the villa because ${reason}.`;
}

export function generateCast(
  count: number,
  existingIds: string[] = [],
): Agent[] {
  const usedNames = new Set<string>();
  const usedColors = new Set<string>();
  const usedArchetypes = new Set<string>();
  const usedVoices = new Set<string>();
  const usedCoreValues = new Set<string>();
  const usedSocialModes = new Set<string>();
  const usedWeaknesses = new Set<string>();
  const usedQuirks = new Set<string>();
  const usedBackstories = new Set<string>();
  const usedIds = new Set(existingIds);
  const agents: Agent[] = [];

  for (let i = 0; i < count; i++) {
    const name = pickUnique(FIRST_NAMES, usedNames);
    usedNames.add(name);

    const age = rollAge();
    const archetype = pickUnique(ARCHETYPES, usedArchetypes);
    usedArchetypes.add(archetype);

    const core = pickUnique(CORE_VALUES, usedCoreValues);
    usedCoreValues.add(core);
    const social = pickUnique(SOCIAL_MODES, usedSocialModes);
    usedSocialModes.add(social);
    const weakness = pickUnique(WEAKNESSES, usedWeaknesses);
    usedWeaknesses.add(weakness);
    const quirk = pickUnique(QUIRKS, usedQuirks);
    usedQuirks.add(quirk);
    const personality = composePersonality(core, social, weakness, quirk);

    const voice = pickUnique(VOICE_STYLES, usedVoices);
    usedVoices.add(voice);

    const job = pick(JOBS);
    const city = pick(CITIES);
    const hook = pickUnique(BACKSTORY_HOOKS, usedBackstories);
    usedBackstories.add(hook);
    const reason = pick(REASONS);
    const bio = composeBio(name, age, job, city, hook, reason);

    const hairAscii = pick(HAIR_STYLES);
    const emojiFace = pick(EMOJI_FACES);
    const colorClass = pickUnique(COLOR_CLASSES, usedColors);
    usedColors.add(colorClass);

    let id = generateId(name);
    while (usedIds.has(id)) {
      id = generateId(name);
    }
    usedIds.add(id);

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
    });
  }

  return agents;
}

export function generateBombshells(
  count: number,
  mainCastIds: string[],
): Agent[] {
  return generateCast(count, mainCastIds);
}
