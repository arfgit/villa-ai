import type { ChallengeCategory } from "@/types";

// Deterministic minigame library. Each entry is a specific game with
// rules + win condition the host reads out. The prompt injects one of
// these so the LLM doesn't invent a vague "let's do a challenge" scene —
// it writes the dialogue AROUND the actual game mechanics.
//
// Grouped by category so the rotation (`learn_facts` ↔ `explore_attraction`
// alternation in `seasonPlanner.nextChallengeCategory`) still drives variety.
export interface MinigameTemplate {
  name: string;
  category: ChallengeCategory;
  rules: string;
  winCondition: string;
}

const LEARN_FACTS_GAMES: MinigameTemplate[] = [
  {
    name: "Mr & Mrs",
    category: "learn_facts",
    rules:
      'Couples sit back-to-back. Host asks "who is most likely to..." style questions about each other; each partner holds up the name they think is correct. One point per match.',
    winCondition:
      "Couple with the most matching answers at the end of 6 questions wins a reward date.",
  },
  {
    name: "Two Truths and a Lie",
    category: "learn_facts",
    rules:
      "Each islander says three statements about themselves — two true, one lie. The villa votes on which one they think is the lie.",
    winCondition:
      "The islander who fooled the most people (most incorrect votes) wins.",
  },
  {
    name: "Red Flag Auction",
    category: "learn_facts",
    rules:
      'Host reads a dating red flag. Each islander decides whether to claim it ("that\'s me") or deny it. Others vote on whether the claim rings true.',
    winCondition:
      'Most "honest read" votes across the round wins. Dishonest picks leak attraction/trust deltas.',
  },
  {
    name: "Lie Detector",
    category: "learn_facts",
    rules:
      'One islander is hooked up to a (prop) lie detector. The villa submits questions. Each answer is rated truth/lie by the host reading the "machine".',
    winCondition:
      "Islander passes if 4 of 5 answers read as truth — wins immunity from the next vote.",
  },
  {
    name: "Couple Trivia",
    category: "learn_facts",
    rules:
      "Host quizzes one partner about the other (favourite food, biggest ick, first impression). Partner returns from soundproof booth to reveal.",
    winCondition:
      "Most correct answers across 5 questions wins. Ties break on biggest ick disagreement.",
  },
];

const EXPLORE_ATTRACTION_GAMES: MinigameTemplate[] = [
  {
    name: "Heart Rate Challenge",
    category: "explore_attraction",
    rules:
      "Each islander wears a heart-rate monitor. Others take turns performing a flirty routine — dance, whisper, lean-in. Biggest spike flags the strongest chemistry.",
    winCondition:
      "The islander who spikes the MOST different hearts wins. Partners watching get jealousy spikes.",
  },
  {
    name: "Blindfold Kisses",
    category: "explore_attraction",
    rules:
      "Blindfolded islanders are kissed on the cheek by three anonymous partners. They guess who kissed them based on feel alone.",
    winCondition:
      "Most correct guesses wins. Biggest surprise match (unlikely pair) triggers bonus attraction deltas.",
  },
  {
    name: "Snog Marry Pie",
    category: "explore_attraction",
    rules:
      "Each islander in turn picks three villa members: one to snog, one to marry, one to pie in the face. Must commit on camera, no diplomacy.",
    winCondition:
      'No winner — the game ends when everyone has picked. Drama score decides who "won the scene".',
  },
  {
    name: "Body Language Test",
    category: "explore_attraction",
    rules:
      "Partner hidden behind screen performs an emotion (desire, jealousy, disappointment) using only the torso up. Islanders read the body language and name the emotion + target.",
    winCondition:
      "Most accurate reads wins. Misreads reveal hidden attractions and prompt jealousy spikes.",
  },
  {
    name: "Hot Tub Truth or Dare",
    category: "explore_attraction",
    rules:
      "Bottle spins in the hot tub. Landed islander picks truth or dare. Dares escalate physical; truths escalate confession.",
    winCondition:
      'Game runs for 5 rounds. "Winner" is whoever the villa votes had the spiciest round.',
  },
];

export function pickMinigame(
  category: ChallengeCategory,
  recentGameNames: string[],
): MinigameTemplate {
  const pool =
    category === "learn_facts" ? LEARN_FACTS_GAMES : EXPLORE_ATTRACTION_GAMES;
  const fresh = pool.filter((g) => !recentGameNames.includes(g.name));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}
