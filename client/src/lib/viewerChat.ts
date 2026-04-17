import type {
  Scene,
  Couple,
  Agent,
  ViewerMessage,
  CasaAmorState,
} from "@/types";
import { loadTrainingArchive, type SeasonSummary } from "./trainingData";

const USERNAMES = [
  "island_obsessed",
  "tea_spiller",
  "reality_trash_tv",
  "couplegoals99",
  "villa_fanatic",
  "drama_detector",
  "love_guru22",
  "plot_twist_queen",
  "couchpotato_critic",
  "team_chaos",
  "shipping_captain",
  "gossip_central",
  "recoupling_stan",
  "bombshell_watcher",
  "casa_amor_survivor",
  "final_rose",
  "not_here_for_friends",
  "heart_rate_monitor",
  "muggy_mike_fan",
  "loyalty_test",
];

const COUPLE_FORMED = [
  "FINALLY omg I've been waiting for this",
  "they're so cute I literally cannot",
  "idk about this one... give it 2 episodes",
  "PROTECT THEM AT ALL COSTS",
  "nah {name} deserves better tbh",
  "the WAY they looked at each other??",
  "this is giving main character energy",
  "called it from episode 1 btw",
];

const COUPLE_BROKEN = [
  "NOOOOO my heart",
  "called it. he was NEVER loyal",
  "her FACE I am screaming",
  "good riddance honestly",
  "the villain edit is STRONG",
  "they fumbled SO hard",
  "plot twist nobody asked for",
  "I need a moment... I am devastated",
];

const ELIMINATION = [
  "JUSTICE was served today",
  "they did {name} SO dirty I'm fuming",
  "unpopular opinion but they were boring",
  "I'm actually crying rn",
  "the villa won't be the same without {name}",
  "ROBBED. absolutely ROBBED.",
  "bye bye don't let the door hit you",
  "their exit speech just broke me",
];

const HIGH_DRAMA = [
  "this is the best season EVER",
  "the DRAMA I am living",
  "someone call the fire department",
  "my jaw is on the FLOOR",
  "I need to call my therapist after this episode",
  "reality TV at its absolute finest",
  "who wrote this script because WOW",
];

const JEALOUSY = [
  "the jealousy in his eyes rn omg",
  "she is FUMING and honestly same",
  "he's fumbling it so bad lmao",
  "the side eye... I can't",
  "they're trying SO hard to look unbothered",
];

const ATTRACTION = [
  "the CHEMISTRY is unreal",
  "they have zero vibes sorry not sorry",
  "their energy together is everything",
  "flirting masterclass right there",
  "someone's head is about to turn",
];

const CASA_AMOR = [
  "CASA AMOR LET'S GOOOOO",
  "oh no... oh NO",
  "{name} is switching 1000% I can feel it",
  "if he doesn't stick I'm turning off my TV",
  "the test of all tests begins NOW",
  "producers really said let's ruin some couples",
  "this is where the real ones separate from the fakers",
];

const CHALLENGE_WIN = [
  "DESERVED they ate that up",
  "rigged ngl but ok",
  "the celebration dance sent me",
  "they work so well together omg",
];

// Templates that reference previous seasons — keep them spicy and specific.
// {prevWinners} / {prevSeason} / {prevTheme} / {currName} get filled in.
const PAST_SEASON_GENERAL = [
  "season {prevSeason} walked so this season could run",
  "this is NOTHING like season {prevSeason}, the energy is so different",
  "season {prevSeason} fans where you at, we're back",
  "producers definitely learned from the season {prevSeason} disaster lol",
  "this season the cast is actually trying unlike season {prevSeason}",
  "giving season {prevSeason} vibes and I am HERE for it",
];

const PAST_SEASON_WITH_WINNERS = [
  "{prevWinners} from season {prevSeason} would NEVER",
  "not us missing {prevWinners} from season {prevSeason} rn",
  "hot take: this couple wouldn't last 2 days against {prevWinners}",
  "{prevWinners} walked so these couples could crawl",
  "remember when {prevWinners} won season {prevSeason}? pure cinema",
  "we need another {prevWinners}-level couple this season",
  "{prevWinners} are the blueprint, nobody is touching that",
];

const PAST_SEASON_COMPARE_TO_CAST = [
  "{currName} is giving season {prevSeason} {prevWinners}-coded behavior",
  "{currName} could learn from how {prevWinners} played their game",
  "{currName} is making season {prevSeason} look TAME",
  "{currName} better study {prevWinners} asap",
];

const PAST_SEASON_THEME = [
  'the "{prevTheme}" vibes from season {prevSeason} hit different',
  'bring back the "{prevTheme}" energy please',
  'season {prevSeason} theme was "{prevTheme}" and it SLAPPED',
];

let idCounter = 0;

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickUsername(): string {
  return (
    USERNAMES[Math.floor(Math.random() * USERNAMES.length)]! +
    Math.floor(Math.random() * 99)
  );
}

function sub(template: string, name: string): string {
  return template.replace("{name}", name);
}

function sentiment(pool: string[]): ViewerMessage["sentiment"] {
  if (pool === COUPLE_BROKEN || pool === ELIMINATION || pool === JEALOUSY)
    return "negative";
  if (pool === HIGH_DRAMA || pool === CASA_AMOR) return "chaotic";
  if (pool === COUPLE_FORMED || pool === ATTRACTION || pool === CHALLENGE_WIN)
    return "positive";
  return "neutral";
}

function msg(pool: string[], name = ""): ViewerMessage {
  return {
    id: `vm_${++idCounter}`,
    username: pickUsername(),
    text: sub(pick(pool), name),
    timestamp: Date.now(),
    sentiment: sentiment(pool),
  };
}

// Render a past-season chat blurb by filling in {prevSeason}/{prevWinners}/{prevTheme}/{currName}.
// Returns null when no suitable past season is available for the requested template.
function buildPastSeasonMessage(
  prev: SeasonSummary,
  currName: string | null,
): ViewerMessage | null {
  const hasWinners = prev.winnerNames !== null;
  const winnersText = hasWinners
    ? `${prev.winnerNames![0]} & ${prev.winnerNames![1]}`
    : "";

  // Pick a template pool that we have data for.
  const pools: Array<{
    pool: string[];
    needsWinners: boolean;
    needsCurr: boolean;
    needsTheme: boolean;
  }> = [
    {
      pool: PAST_SEASON_GENERAL,
      needsWinners: false,
      needsCurr: false,
      needsTheme: false,
    },
  ];
  if (hasWinners)
    pools.push({
      pool: PAST_SEASON_WITH_WINNERS,
      needsWinners: true,
      needsCurr: false,
      needsTheme: false,
    });
  if (hasWinners && currName)
    pools.push({
      pool: PAST_SEASON_COMPARE_TO_CAST,
      needsWinners: true,
      needsCurr: true,
      needsTheme: false,
    });
  if (prev.theme && prev.theme.trim().length > 0)
    pools.push({
      pool: PAST_SEASON_THEME,
      needsWinners: false,
      needsCurr: false,
      needsTheme: true,
    });

  const choice = pools[Math.floor(Math.random() * pools.length)]!;
  const template = pick(choice.pool);
  const text = template
    .replace("{prevSeason}", String(prev.seasonNumber))
    .replace("{prevWinners}", winnersText)
    .replace("{prevTheme}", prev.theme ?? "")
    .replace("{currName}", currName ?? "this cast");

  return {
    id: `vm_${++idCounter}`,
    username: pickUsername(),
    text,
    timestamp: Date.now(),
    sentiment: "neutral",
  };
}

export function generateViewerReactions(
  scene: Scene,
  _couples: Couple[],
  cast: Agent[],
  eliminatedThisScene: string[],
  casaAmorState: CasaAmorState | null,
  sceneNumber?: number,
): ViewerMessage[] {
  const messages: ViewerMessage[] = [];
  const getName = (id: string) => cast.find((a) => a.id === id)?.name ?? id;

  // Past-season nostalgia: chat viewers are longtime fans. When there's an
  // archive, inject a callback referencing a past season (higher chance early
  // in the new season when comparisons are freshest; lower chance later).
  const archive = loadTrainingArchive();
  if (archive.seasons.length > 0) {
    const earlyBoost =
      sceneNumber !== undefined && sceneNumber <= 6 ? 0.45 : 0.18;
    if (Math.random() < earlyBoost) {
      const prev =
        archive.seasons[Math.floor(Math.random() * archive.seasons.length)]!;
      // Anchor on a specific on-screen contestant when we have one — makes the
      // comparison feel targeted rather than generic.
      const speakers = scene.dialogue
        .map((d) => d.agentId)
        .filter((id) => id !== "host");
      const anchorId =
        speakers.length > 0
          ? speakers[Math.floor(Math.random() * speakers.length)]!
          : null;
      const anchorName = anchorId ? getName(anchorId) : null;
      const nostalgia = buildPastSeasonMessage(prev, anchorName);
      if (nostalgia) messages.push(nostalgia);
    }
  }

  // React to LLM-tagged quotable lines first — these are the spiciest moments
  // of the scene per the model. Fall back to heuristics only if nothing is
  // tagged and we need a dialogue-driven reaction.
  const quotableLines = scene.dialogue.filter(
    (d) => d.quotable && d.agentId !== "host",
  );
  const dialogueSource =
    quotableLines.length > 0
      ? quotableLines
      : scene.dialogue.filter(
          (d) => d.text.length > 30 && d.agentId !== "host",
        );

  // Up to 2 dialogue-driven reactions — named speaker, named target when we
  // have one, and a template tuned to the emotional register.
  const quoteCount = Math.min(2, dialogueSource.length);
  for (let i = 0; i < quoteCount; i++) {
    const line = dialogueSource[i]!;
    const speakerName = getName(line.agentId);
    const targetName = line.targetAgentId ? getName(line.targetAgentId) : null;
    const shortQuote =
      line.text.length > 60 ? line.text.slice(0, 57) + "..." : line.text;
    let text: string;
    if (line.emotion === "angry" || line.emotion === "jealous") {
      text = targetName
        ? `${speakerName} just EXPOSED ${targetName} 😭 "${shortQuote}"`
        : `${speakerName} went OFF. "${shortQuote}" I am deceased`;
    } else if (line.emotion === "sad" || line.emotion === "shocked") {
      text = targetName
        ? `${targetName} did NOT deserve what ${speakerName} just said...`
        : `${speakerName} saying "${shortQuote}" broke me`;
    } else if (line.emotion === "flirty" || line.emotion === "happy") {
      text = targetName
        ? `${speakerName} and ${targetName} ARE EVERYTHING rn`
        : `${speakerName} with "${shortQuote}" — I fold`;
    } else {
      text = `"${shortQuote}" — ${speakerName} with the quote of the scene`;
    }
    const sentiment: ViewerMessage["sentiment"] =
      line.emotion === "angry" || line.emotion === "jealous"
        ? "chaotic"
        : line.emotion === "sad" || line.emotion === "shocked"
          ? "negative"
          : line.emotion === "flirty" || line.emotion === "happy"
            ? "positive"
            : "neutral";
    messages.push({
      id: `vm_${++idCounter}`,
      username: pickUsername(),
      text,
      timestamp: Date.now(),
      sentiment,
    });
  }

  // Emotion-cluster reactions. When the scene leans hard in one emotional
  // direction (3+ lines of the same emotion), chat clocks the mood shift —
  // this catches scenes where the LLM didn't tag anything `quotable` but
  // the tone is still distinct.
  const emotionCounts: Record<string, number> = {};
  const dialogueOnly = scene.dialogue.filter((d) => d.agentId !== "host");
  for (const line of dialogueOnly) {
    emotionCounts[line.emotion] = (emotionCounts[line.emotion] ?? 0) + 1;
  }
  const sortedEmotions = Object.entries(emotionCounts).sort(
    (a, b) => b[1] - a[1],
  );
  const topEmotion = sortedEmotions[0];
  if (topEmotion && topEmotion[1] >= 3) {
    const [emo] = topEmotion;
    const sample = dialogueOnly.find((d) => d.emotion === emo);
    const sampleName = sample ? getName(sample.agentId) : null;
    const clusterText: Record<string, string> = {
      angry: sampleName
        ? `everyone's FUMING this scene and ${sampleName} is leading the charge`
        : "the villa is at each other's throats tonight",
      jealous: sampleName
        ? `the jealousy in this scene is so thick you could cut it. ${sampleName} 😬`
        : "jealousy levels are UNHINGED",
      flirty: sampleName
        ? `${sampleName} and co. are out here giggling and kicking their feet rn`
        : "everyone's flirty tonight, love is in the air 💕",
      sad: "this scene has me reaching for the tissues ngl",
      shocked: "the gasps in this scene are SENDING me",
      happy: "i love when the villa is actually happy together",
      smug: "the smugness in this scene is OFF the charts",
      anxious: "the vibes are so nervous rn, everyone spiralling",
    };
    if (clusterText[emo]) {
      const sentimentMap: Record<string, ViewerMessage["sentiment"]> = {
        angry: "chaotic",
        jealous: "chaotic",
        flirty: "positive",
        sad: "negative",
        shocked: "negative",
        happy: "positive",
        smug: "neutral",
        anxious: "negative",
      };
      messages.push({
        id: `vm_${++idCounter}`,
        username: pickUsername(),
        text: clusterText[emo]!,
        timestamp: Date.now(),
        sentiment: sentimentMap[emo] ?? "neutral",
      });
    }
  }

  // Target-fixation reactions. When one person is the target of 3+ lines,
  // the villa is "ganging up" — chat registers that dynamic with a reaction
  // naming the target specifically.
  const targetCounts: Record<string, number> = {};
  for (const line of dialogueOnly) {
    if (line.targetAgentId) {
      targetCounts[line.targetAgentId] =
        (targetCounts[line.targetAgentId] ?? 0) + 1;
    }
  }
  const topTarget = Object.entries(targetCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTarget && topTarget[1] >= 3) {
    const targetName = getName(topTarget[0]);
    const fixationLines = [
      `everyone coming for ${targetName} this scene is WILD`,
      `why is it always ${targetName} in the middle of it 😭`,
      `${targetName} can NOT catch a break tonight`,
      `chat it is OPEN SEASON on ${targetName}`,
    ];
    messages.push({
      id: `vm_${++idCounter}`,
      username: pickUsername(),
      text: fixationLines[Math.floor(Math.random() * fixationLines.length)]!,
      timestamp: Date.now(),
      sentiment: "chaotic",
    });
  }

  // Couple events
  for (const event of scene.systemEvents) {
    if (event.type === "couple_formed" && event.fromId && event.toId) {
      const nameA = getName(event.fromId);
      const nameB = getName(event.toId);
      messages.push(msg(COUPLE_FORMED, `${nameA} and ${nameB}`));
    }
    if (event.type === "couple_broken" && event.fromId && event.toId) {
      messages.push(msg(COUPLE_BROKEN, getName(event.fromId)));
    }
    if (
      event.type === "jealousy_spike" &&
      event.delta &&
      event.delta >= 8 &&
      event.fromId
    ) {
      messages.push(msg(JEALOUSY, getName(event.fromId)));
    }
    if (
      (event.type === "minigame_win" || event.type === "challenge_win") &&
      event.fromId
    ) {
      messages.push(msg(CHALLENGE_WIN, getName(event.fromId)));
    }
  }

  // Eliminations — name the person
  for (const id of eliminatedThisScene) {
    messages.push(msg(ELIMINATION, getName(id)));
    // Extra reaction for the eliminated person's partner
    const partner = _couples.find((c) => c.a === id || c.b === id);
    if (partner) {
      const partnerName = getName(partner.a === id ? partner.b : partner.a);
      messages.push({
        id: `vm_${++idCounter}`,
        username: pickUsername(),
        text: `${partnerName} watching ${getName(id)} leave is breaking my heart`,
        timestamp: Date.now(),
        sentiment: "negative",
      });
    }
  }

  // Casa Amor — reference who's likely switching
  if (casaAmorState && scene.type.startsWith("casa_amor")) {
    const randomCast = cast[Math.floor(Math.random() * cast.length)];
    messages.push(msg(CASA_AMOR, randomCast?.name ?? "someone"));
  }

  // High drama
  if (scene.systemEvents.length >= 4) {
    messages.push(msg(HIGH_DRAMA));
  }

  // Attraction
  const bigAttraction = scene.systemEvents.find(
    (e) => e.type === "attraction_change" && e.delta && e.delta >= 6,
  );
  if (bigAttraction && bigAttraction.fromId && bigAttraction.toId) {
    const fromName = getName(bigAttraction.fromId);
    const toName = getName(bigAttraction.toId);
    messages.push({
      id: `vm_${++idCounter}`,
      username: pickUsername(),
      text: `the chemistry between ${fromName} and ${toName} is UNREAL`,
      timestamp: Date.now(),
      sentiment: "positive",
    });
  }

  // Always at least 2 messages. Prefer a speaker from THIS scene before
  // falling back to a random villa member — reactions feel disconnected when
  // chat is talking about someone who never appeared on screen.
  while (messages.length < 2) {
    const sceneSpeakers = Array.from(
      new Set(
        scene.dialogue.map((d) => d.agentId).filter((id) => id !== "host"),
      ),
    );
    const pool =
      sceneSpeakers.length > 0 ? sceneSpeakers : cast.map((c) => c.id);
    const pickedId = pool[Math.floor(Math.random() * pool.length)]!;
    const name = getName(pickedId);
    const personalized = [
      `${name} is giving main character energy this episode`,
      `someone check on ${name} because I don't think they're ok`,
      `${name} screen time >>> everyone else's screen time`,
      `I need a ${name} confessional episode ASAP`,
      `${name} is carrying this whole season honestly`,
    ];
    messages.push({
      id: `vm_${++idCounter}`,
      username: pickUsername(),
      text: pick(personalized),
      timestamp: Date.now(),
      sentiment: "neutral",
    });
  }

  // Cap at 8
  return messages.slice(0, 8);
}

export function updateViewerSentiment(
  current: Record<string, number>,
  scene: Scene,
  couples: Couple[],
): Record<string, number> {
  const updated = { ...current };

  for (const line of scene.dialogue) {
    if (!updated[line.agentId]) updated[line.agentId] = 50;
    // Speaking in scenes builds some popularity
    updated[line.agentId] = Math.min(100, (updated[line.agentId] ?? 50) + 0.5);

    // Funny/charming lines boost popularity
    if (line.emotion === "happy" || line.emotion === "flirty") {
      updated[line.agentId] = Math.min(100, (updated[line.agentId] ?? 50) + 1);
    }
    // Villain behavior drops popularity
    if (line.emotion === "smug" || line.emotion === "angry") {
      updated[line.agentId] = Math.max(0, (updated[line.agentId] ?? 50) - 1.5);
    }
  }

  // Coupled people get a small bump (viewers love love)
  for (const c of couples) {
    updated[c.a] = Math.min(100, (updated[c.a] ?? 50) + 0.3);
    updated[c.b] = Math.min(100, (updated[c.b] ?? 50) + 0.3);
  }

  return updated;
}
