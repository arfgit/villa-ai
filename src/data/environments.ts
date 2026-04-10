import type { SceneType } from '@/types'

export const ENVIRONMENTS: Record<SceneType, string> = {
  firepit: `      .   *    .   *    .   *
   *    .    *    .   *    .
  ~~~~~~~~~~~~~~~~~~~~~~~~~~
       (  )    (  )
        )(      )(
       (  )    (  )
        ||      ||
   ~~~~~~~~~~~~~~~~~~~~~~~~~~
   [log]              [log]`,
  pool: `   ╔══════════════════════════╗
   ║ ~  ~  ~  ~  ~  ~  ~  ~  ║
   ║~  ~  ~  ~  ~  ~  ~  ~ ~ ║
   ║ ~  ~  ~  ~  ~  ~  ~  ~  ║
   ╚══════════════════════════╝
    ☀    [lounger]   [lounger]`,
  kitchen: `   ┌──────────────────────────┐
   │  [☕]  [🍳]  [🥐]  [📻]   │
   ├──────────────────────────┤
   │  ‾‾‾‾‾  island  ‾‾‾‾‾   │
   └──────────────────────────┘`,
  bedroom: `   ╔══════════════════════════╗
   ║  [bed]   [bed]   [bed]   ║
   ║   ▓▓▓     ▓▓▓     ▓▓▓    ║
   ║                          ║
   ╚══════════════════════════╝`,
  recouple: `           🔥
        .  |  .
      .    |    .
   [1] [2] [3] [4] [5] [6]
   ‾‾‾ ‾‾‾ ‾‾‾ ‾‾‾ ‾‾‾ ‾‾‾`,
  date: `      .   *    .   *    .
   ~~~~~~~~~~~~~~~~~~~~~~~~~~
        🕯              🕯
   ~~~~~~~~~~~~~~~~~~~~~~~~~~
        [table for two]`,
  challenge: `   ╔══════════════════════════╗
   ║  ★ ★ ★  CHALLENGE  ★ ★ ★ ║
   ╚══════════════════════════╝
       🏆           🏆`,
}

export const SCENE_LABELS: Record<SceneType, { title: string; emoji: string }> = {
  firepit: { title: 'Firepit Chat', emoji: '🔥' },
  pool: { title: 'Pool Hangout', emoji: '🌊' },
  kitchen: { title: 'Morning Kitchen', emoji: '☕' },
  bedroom: { title: 'Bedroom Drama', emoji: '🛏️' },
  recouple: { title: 'Recoupling', emoji: '💔' },
  date: { title: 'Date Night', emoji: '🕯️' },
  challenge: { title: 'Challenge', emoji: '🏆' },
}
