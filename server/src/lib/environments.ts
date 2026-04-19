import type { SceneType } from "@villa-ai/shared";

export const ENVIRONMENTS: Record<SceneType, string> = {
  introductions: `      ✦    .    ✦    .    ✦
   .     ☀    WELCOME    ☀    .
 ──────────────────────────────
   🌴          🏝          🌴
      ┌──────────────────┐
      │  VILLA ENTRANCE  │
      └──────────────────┘
       ╱│╲   ╱│╲   ╱│╲
     new arrivals, first looks
 ╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴`,

  firepit: `   *   .  ✦  .   *   .  ✦  .
  .  *   .   ✦   .   *   .  ✦
 ──────────────────────────────
   ▲▲▲    ▲▲▲▲▲     ▲▲▲▲▲
  ▲▲▲▲▲  ▲▲▲▲▲▲▲   ▲▲▲▲▲▲▲
        ) ◯ ◯ ◯ (
         ( ◯◯◯◯◯ )
          ▆▆▆▆▆
   [log]            [log]
 ╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴╴`,

  pool: `   ╲│╱       🌴
   ─☼─                  🌴
   ╱│╲
 ╔══════════════════════════╗
 ║~  ~~  ~  ~~~  ~  ~~  ~  ║
 ║ ~~  ~  ~~~  ~  ~~  ~~  ~║
 ║~  ~  ~~~ ~  ~~  ~~~  ~ ~║
 ║  ~~  ~  ~~  ~~~  ~  ~~  ║
 ╚══════════════════════════╝
   ⛱  [lounger] [lounger]`,

  kitchen: `┌──────────────────────────┐
│ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ ▓▓ │
│  [☕][🍳][🥐][📻][🌿]    │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │
│   ╔══════════════════╗   │
│   ║  marble island   ║   │
│   ╚══════════════════╝   │
│  [stool][stool][stool]   │
└──────────────────────────┘`,

  bedroom: ` ✦    ✦    ✦    ✦    ✦    ✦
╔══════════════════════════╗
║  ┌───┐   ┌───┐   ┌───┐   ║
║  │░░░│   │░░░│   │░░░│   ║
║  └───┘   └───┘   └───┘   ║
║                          ║
║  ┌───┐   ┌───┐   ┌───┐   ║
║  │░░░│   │░░░│   │░░░│   ║
║  └───┘   └───┘   └───┘   ║
╚══════════════════════════╝`,

  recouple: `        ✦   ╲│╱   ✦
            ─☆─
            ╱│╲
        .─-─-─-─-.
       (  FIREPIT  )
        '-─-─-─-─'
        ▆▆▆▆▆▆▆▆
 [1] [2] [3] [4] [5] [6]
  ─   ─   ─   ─   ─   ─
   "tonight, one leaves"`,

  date: `   *  .  ✦  .   *   .   ✦
  .  *   .   *   .   ✦   .
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~
       beach at dusk
 ~~~~~~~~~~~~~~~~~~~~~~~~~~~
   🕯                 🕯
       ╔════════╗
       ║  🌹   ║
       ╚════════╝
   [chair]       [chair]`,

  challenge: ` ╔══════════════════════════╗
 ║ ★ ★ CHALLENGE TIME ★ ★  ║
 ╚══════════════════════════╝
    🏆                 🏆
   ╱│╲                ╱│╲
 ┌────┐ ┌────┐ ┌────┐ ┌────┐
 │ A  │ │ B  │ │ C  │ │ D  │
 │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│ │▓▓▓▓│
 └────┘ └────┘ └────┘ └────┘
   stations on the lawn`,

  interview: `     ┌──────────────────────┐
     │   ● REC          ░░  │
     │                      │
     │    ╔════════════╗    │
     │    ║  beach bg  ║    │
     │    ║    ✦  ✦    ║    │
     │    ╚════════════╝    │
     │                      │
     │   [velvet cushion]   │
     └──────────────────────┘
   "confessional — tell me everything"`,

  bombshell: `   📱 ✦  "i've got a text"  ✦
 ╔══════════════════════════╗
 ║   ╲│╱ incoming ╲│╱       ║
 ║    ╲ bombshell ╱          ║
 ║     ─ arrives ─           ║
 ║     ▆▆▆▆▆▆▆▆▆▆            ║
 ║     villa entrance        ║
 ╚══════════════════════════╝
     the others freeze up`,

  minigame: ` ╔══════════════════════════╗
 ║   ✦  MINI GAME  ✦        ║
 ╚══════════════════════════╝
     🎯              🎯
   ┌──────┐      ┌──────┐
   │ ▓▓▓▓ │  vs  │ ▓▓▓▓ │
   │couple│      │couple│
   └──────┘      └──────┘
     ═════  bond boost  ═════
        winner gets +reward`,

  public_vote: "📱 PUBLIC VOTE — the public has spoken",
  islander_vote: "🗳 ISLANDER VOTE — the cast must choose",
  producer_twist: "📺 PRODUCER TWIST — expect the unexpected",
  casa_amor_arrival: "🏠 CASA AMOR — the villa is splitting",
  casa_amor_date: "💋 CASA DATE — temptation in both villas",
  casa_amor_challenge: "🔥 CASA CHALLENGE — loyalty tested",
  casa_amor_stickswitch: "💔 STICK or SWITCH — the most dramatic night",
  grand_finale: "👑 GRAND FINALE — live chat crowns the winners",
};

export const SCENE_LABELS: Record<SceneType, { title: string; emoji: string }> =
  {
    introductions: { title: "Introductions", emoji: "🌅" },
    firepit: { title: "Firepit Chat", emoji: "🔥" },
    pool: { title: "Pool Hangout", emoji: "🌊" },
    kitchen: { title: "Morning Kitchen", emoji: "☕" },
    bedroom: { title: "Bedroom Drama", emoji: "🛏️" },
    recouple: { title: "Recoupling", emoji: "💔" },
    date: { title: "Date Night", emoji: "🕯️" },
    challenge: { title: "Challenge", emoji: "🏆" },
    interview: { title: "Confessional", emoji: "🎙️" },
    bombshell: { title: "Bombshell Arrival", emoji: "💣" },
    minigame: { title: "Mini Game", emoji: "🎯" },
    public_vote: { title: "Public Vote", emoji: "📱" },
    islander_vote: { title: "Islander Vote", emoji: "🗳️" },
    producer_twist: { title: "Producer Twist", emoji: "📺" },
    casa_amor_arrival: { title: "Casa Amor", emoji: "🏠" },
    casa_amor_date: { title: "Casa Date", emoji: "💋" },
    casa_amor_challenge: { title: "Casa Challenge", emoji: "🔥" },
    casa_amor_stickswitch: { title: "Stick or Switch", emoji: "💔" },
    grand_finale: { title: "Grand Finale", emoji: "👑" },
  };

export const FIRST_COUPLING_LABEL = { title: "First Coupling", emoji: "💕" };

/**
 * Resolve the display label for a scene. For recouple scenes we substitute
 * "First Coupling" on the first recouple of the episode. `recoupleOrdinal` is
 * the 1-based index of this scene among all recouple scenes in the episode
 * (pass 0 or undefined for non-recouple scenes).
 */
export function getSceneLabel(
  sceneType: SceneType,
  recoupleOrdinal?: number,
): { title: string; emoji: string } {
  if (sceneType === "recouple" && recoupleOrdinal === 1) {
    return FIRST_COUPLING_LABEL;
  }
  return SCENE_LABELS[sceneType];
}
