import type { SceneType } from '@/types'

export const ENVIRONMENTS: Record<SceneType, string> = {
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

  public_vote: ` ╔══════════════════════════╗
 ║  📱  PUBLIC VOTE  📱      ║
 ╚══════════════════════════╝
     ┌────────────────────┐
     │  THE PUBLIC HAS    │
     │  BEEN VOTING...    │
     │  📊 ▓▓▓▓░░░░░ 📊  │
     └────────────────────┘
     someone is going home`,

  islander_vote: ` ╔══════════════════════════╗
 ║  🗳  ISLANDER VOTE  🗳    ║
 ╚══════════════════════════╝
      🔥  the firepit  🔥
     ┌────────────────────┐
     │  ◯ ◯ ◯   ◯ ◯ ◯  │
     │    the islanders   │
     │     must choose    │
     └────────────────────┘`,

  producer_twist: ` ╔══════════════════════════╗
 ║  📺  PRODUCER TWIST  📺   ║
 ╚══════════════════════════╝
     ┌────────────────────┐
     │  🎬  BREAKING NEWS │
     │  the producers     │
     │  have decided...   │
     └────────────────────┘`,

  casa_amor_arrival: ` ╔══════════════════════════╗
 ║  🏠  CASA AMOR  🏠        ║
 ╚══════════════════════════╝
   🌴  ┌─────┐  ┌─────┐  🌴
       │VILLA│  │CASA │
       │  1  │  │AMOR │
       └─────┘  └─────┘
     the villa is SPLITTING`,

  casa_amor_date: ` ╔══════════════════════════╗
 ║  💋  CASA DATE  💋        ║
 ╚══════════════════════════╝
   🌴          🌊
     ┌────────────────────┐
     │  temptation awaits │
     │    in both villas  │
     └────────────────────┘`,

  casa_amor_challenge: ` ╔══════════════════════════╗
 ║  🔥  CASA CHALLENGE  🔥   ║
 ╚══════════════════════════╝
   ┌──────┐    ┌──────┐
   │  OG  │ vs │ CASA │
   │ crew │    │ crew │
   └──────┘    └──────┘
      loyalty is tested`,

  casa_amor_stickswitch: ` ╔══════════════════════════╗
 ║  💔  STICK or SWITCH  💔  ║
 ╚══════════════════════════╝
     ┌────────────────────┐
     │  ❤️  stick  ❤️     │
     │  or                │
     │  💔  switch  💔    │
     └────────────────────┘
   the most dramatic night`,

  grand_finale: ` ╔══════════════════════════╗
 ║  ★  GRAND FINALE  ★      ║
 ╚══════════════════════════╝
   ┌────────┐      ┌────────┐
   │ couple │  vs  │ couple │
   │   #1   │      │   #2   │
   └────────┘      └────────┘
     💬 live chat decides 💬`,
}

export const SCENE_LABELS: Record<SceneType, { title: string; emoji: string }> = {
  firepit: { title: 'Firepit Chat', emoji: '🔥' },
  pool: { title: 'Pool Hangout', emoji: '🌊' },
  kitchen: { title: 'Morning Kitchen', emoji: '☕' },
  bedroom: { title: 'Bedroom Drama', emoji: '🛏️' },
  recouple: { title: 'Recoupling', emoji: '💔' },
  date: { title: 'Date Night', emoji: '🕯️' },
  challenge: { title: 'Challenge', emoji: '🏆' },
  interview: { title: 'Confessional', emoji: '🎙️' },
  bombshell: { title: 'Bombshell Arrival', emoji: '💣' },
  minigame: { title: 'Mini Game', emoji: '🎯' },
  public_vote: { title: 'Public Vote', emoji: '📱' },
  islander_vote: { title: 'Islander Vote', emoji: '🗳️' },
  producer_twist: { title: 'Producer Twist', emoji: '📺' },
  casa_amor_arrival: { title: 'Casa Amor', emoji: '🏠' },
  casa_amor_date: { title: 'Casa Date', emoji: '💋' },
  casa_amor_challenge: { title: 'Casa Challenge', emoji: '🔥' },
  casa_amor_stickswitch: { title: 'Stick or Switch', emoji: '💔' },
  grand_finale: { title: 'Grand Finale', emoji: '👑' },
}

export const FIRST_COUPLING_LABEL = { title: 'First Coupling', emoji: '💕' }

export function getSceneLabel(
  sceneType: SceneType,
  recoupleOrdinal?: number
): { title: string; emoji: string } {
  if (sceneType === 'recouple' && recoupleOrdinal === 1) {
    return FIRST_COUPLING_LABEL
  }
  return SCENE_LABELS[sceneType]
}
