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
