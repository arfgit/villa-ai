import type { Agent, Relationship, EmotionState, Couple, Scene, SceneType, AgentMemory, Host } from '@villa-ai/shared'
import { SCENE_LABELS } from './environments.js'
import { buildPastSeasonsPromptBlock } from './trainingData.js'

interface BuildArgs {
  cast: Agent[]
  host?: Host
  relationships: Relationship[]
  emotions: EmotionState[]
  couples: Couple[]
  recentScenes: Scene[]
  sceneType: SceneType
  seasonTheme: string
  sceneNumber: number
  totalScenes?: number  // legacy — no longer fixed, season length is dynamic
  forcedParticipants?: string[]
  isIntroduction?: boolean
  isFinale?: boolean
  // Memories retrieved from each participant's brain — top-K relevant to this scene.
  agentMemories?: Record<string, AgentMemory[]>
  // Current self-stated goals from each agent's brain.
  agentGoals?: Record<string, string>
  // Current RL policy string per agent, used to condition behavior.
  agentPolicies?: Record<string, string>
  // Bombshell-specific: the new contestant(s) arriving this scene (1 or 2).
  arrivingBombshell?: Agent
  arrivingBombshells?: Agent[]
  // Interview-specific: the lone subject of the confessional.
  interviewSubjectId?: string
  // Minigame-specific: the couples competing (all must be included).
  competingCoupleIds?: string[][]
  // Reward-date specific: names of the couple the date is rewarding
  isRewardDate?: boolean
  rewardDateCoupleNames?: [string, string]
}

export function buildScenePrompt(args: BuildArgs): string {
  const {
    cast, host, relationships, emotions, couples,
    recentScenes, sceneType, seasonTheme, sceneNumber,
    forcedParticipants, isIntroduction, isFinale,
    agentMemories, agentGoals, agentPolicies,
    arrivingBombshell, arrivingBombshells, interviewSubjectId, competingCoupleIds,
    isRewardDate, rewardDateCoupleNames,
  } = args
  const sceneInfo = SCENE_LABELS[sceneType]

  const castBlock = cast
    .map((a) => `- ${a.id} (${a.name}, ${a.age}) [${a.archetype}]\n  voice: ${a.voice}\n  bio: ${a.bio}\n  traits: ${a.personality}`)
    .join('\n')

  // Build host drama intel: find the most dramatic tensions to reference
  let hostIntel = ''
  if (host) {
    const tensions: string[] = []
    // Find lowest-trust couples (fragile bonds the host can probe)
    for (const c of couples) {
      const ab = relationships.find((r) => r.fromId === c.a && r.toId === c.b)
      const ba = relationships.find((r) => r.fromId === c.b && r.toId === c.a)
      const avgTrust = ((ab?.trust ?? 50) + (ba?.trust ?? 50)) / 2
      if (avgTrust < 30) {
        const nameA = cast.find((x) => x.id === c.a)?.name ?? c.a
        const nameB = cast.find((x) => x.id === c.b)?.name ?? c.b
        tensions.push(`${nameA} and ${nameB}'s trust is fragile — the host senses cracks`)
      }
    }
    // Find highest jealousy pairs
    const highJealousy = relationships
      .filter((r) => r.jealousy >= 40 && cast.some((c) => c.id === r.fromId) && cast.some((c) => c.id === r.toId))
      .sort((a, b) => b.jealousy - a.jealousy)
      .slice(0, 2)
    for (const r of highJealousy) {
      const fromName = cast.find((c) => c.id === r.fromId)?.name ?? r.fromId
      const toName = cast.find((c) => c.id === r.toId)?.name ?? r.toId
      tensions.push(`${fromName} is jealous of ${toName} — the host can exploit this`)
    }
    // Find recent couple breaks from last 3 scenes
    for (const s of recentScenes) {
      for (const e of s.systemEvents) {
        if (e.type === 'couple_broken' && e.label) {
          tensions.push(`Recent drama: ${e.label}`)
        }
      }
    }
    if (tensions.length > 0) {
      hostIntel = `\n  HOST INTEL (reference these tensions in host dialogue):\n  ${tensions.slice(0, 4).map((t) => `• ${t}`).join('\n  ')}`
    }
  }

  const hostBlock = host
    ? `\n## HOST (narrator & emcee — NOT a contestant, never coupled)
- ${host.id} (${host.name})
  voice: ${host.voice}
  THE HOST IS THE BACKBONE OF THE SHOW. Like Maya Jama on Love Island, the host:
  - OPENS every scene they're in with a dramatic entrance or announcement
  - Introduces and explains mini-game rules in detail before play begins
  - Reads out "texts" that arrive at key moments ("I GOT A TEXT!" — announce twists, recoupling news, elimination warnings)
  - Calls out specific names and tensions: "Maya... are you REALLY happy right now?"
  - At recouplings: builds suspense before each pick, announces who's at risk, delivers elimination verdicts with gravity
  - At bombshell arrivals: hypes the entrance, teases the existing cast about the threat
  - CLOSES the scene with a cliffhanger tease or dramatic sign-off
  The host MUST have at least 2-3 substantial dialogue lines per scene. They are NOT background — they DRIVE the action.${hostIntel}`
    : ''

  const allBombshells = arrivingBombshells ?? (arrivingBombshell ? [arrivingBombshell] : [])
  const bombshellBlock = allBombshells.length > 0
    ? `\n## ARRIVING BOMBSHELL${allBombshells.length > 1 ? 'S' : ''} (new contestant${allBombshells.length > 1 ? 's' : ''} walking in THIS scene)\n` +
      allBombshells.map((b) =>
        `- ${b.id} (${b.name}, ${b.age}) [${b.archetype}]\n  voice: ${b.voice}\n  bio: ${b.bio}\n  traits: ${b.personality}`
      ).join('\n')
    : ''

  const relsBlock = relationships
    .filter((r) => cast.some((c) => c.id === r.fromId) && cast.some((c) => c.id === r.toId))
    .map((r) => `${r.fromId}->${r.toId}: trust ${r.trust}, attraction ${r.attraction}, jealousy ${r.jealousy}`)
    .join('\n')

  const emotionsBlock = emotions
    .filter((e) => cast.some((c) => c.id === e.agentId))
    .map((e) => `${e.agentId}: ${e.primary} (${e.intensity})`)
    .join('\n')

  const couplesBlock = couples.length > 0
    ? couples.map((c) => `- ${c.a} & ${c.b}`).join('\n')
    : 'No couples yet (early days, mingling phase)'

  // Give the model actual detail to build continuity on — not just the
  // one-sentence outcome. Key events + 2 notable dialogue lines per scene.
  const recentBlock = recentScenes.length > 0
    ? recentScenes.map((s, i) => {
        const keyEvents = s.systemEvents
          .filter((e) => e.type === 'couple_formed' || e.type === 'couple_broken' || e.type === 'minigame_win' || e.type === 'challenge_win')
          .map((e) => `    [${e.type}] ${e.label}`)
          .slice(0, 3)
        const keyLines = s.dialogue
          .filter((d) => (d.text?.length ?? 0) > 20)
          .slice(0, 2)
          .map((d) => `    "${d.text}" — ${d.agentId}`)
        return `Scene ${i + 1} (${s.type}): ${s.outcome}${keyEvents.length > 0 ? '\n' + keyEvents.join('\n') : ''}${keyLines.length > 0 ? '\n' + keyLines.join('\n') : ''}`
      }).join('\n')
    : 'No prior scenes. This is the season opener.'

  // Per-participant brain block: goal, current policy, retrieved memories.
  // The arriving bombshell (if any) isn't in `cast` yet, but they should
  // still appear here with an empty brain block so the LLM knows who they are.
  const castWithArrivals: Agent[] = allBombshells.length > 0
    ? [...cast, ...allBombshells]
    : cast
  const brainParticipants = forcedParticipants
    ? castWithArrivals.filter((c) => forcedParticipants.includes(c.id))
    : castWithArrivals
  const brainBlock = brainParticipants
    .map((p) => {
      const goal = agentGoals?.[p.id]?.trim()
      const policy = agentPolicies?.[p.id]?.trim()
      const mems = agentMemories?.[p.id] ?? []
      const memList =
        mems.length > 0
          ? mems
              .map((m) => `    • [${m.type}, importance ${m.importance}] ${m.content}`)
              .join('\n')
          : '    • (no specific memories yet)'
      const goalLine = goal ? `\n  goal: ${goal}` : ''
      const policyLine = policy ? `\n  current strategy: ${policy}` : ''
      return `- ${p.name} (${p.id})${goalLine}${policyLine}\n  memories:\n${memList}`
    })
    .join('\n')

  // Build participants clause based on scene type
  let participantsClause: string
  if (isIntroduction) {
    participantsClause = `MUST include the host AND all ${cast.length} contestants. The host speaks first, then each contestant introduces themselves, then the host announces the initial pairings.`
  } else if (isFinale) {
    participantsClause = `MUST include the host AND all ${cast.length} remaining contestants. The host leads the ceremony, the contestants speak in turn.`
  } else if (sceneType === 'interview' && interviewSubjectId) {
    const subj = cast.find((c) => c.id === interviewSubjectId)
    participantsClause = `MUST be a solo confessional. ONLY ${subj?.name ?? interviewSubjectId} (${interviewSubjectId}) speaks. 3 to 5 dialogue lines, ALL from them. NO targetAgentId — they are talking directly to the audience/camera. NO other agents.`
  } else if (sceneType === 'bombshell' && allBombshells.length > 0) {
    const bombNames = allBombshells.map((b) => `${b.name} (${b.id})`).join(' and ')
    participantsClause = `MUST include ${allBombshells.length > 1 ? 'the bombshells' : 'the bombshell'} ${bombNames} AND all active contestants. ${allBombshells.length > 1 ? 'The bombshells arrive together, creating double the chaos.' : 'The bombshell arrives'}, mingles, and gets a feel for everyone — they do NOT immediately couple up. They will go on dates in the next few scenes before choosing at the next recoupling.`
  } else if (sceneType === 'minigame') {
    const coupleDesc = competingCoupleIds && competingCoupleIds.length > 0
      ? competingCoupleIds.map((c) => `${cast.find((x) => x.id === c[0])?.name}+${cast.find((x) => x.id === c[1])?.name}`).join(' vs ')
      : 'no couples formed yet — pair singles ad hoc'
    const allNames = cast.map((c) => c.name).join(', ')
    participantsClause = `MUST include ALL ${cast.length} active contestants. Existing couples compete together (${coupleDesc}); singles are paired ad hoc for the game only (no state change). You MUST include at least one dialogue line from EVERY contestant. Required speakers: ${allNames}. The host narrates the rules at the start.`
  } else if (sceneType === 'challenge') {
    participantsClause = `MUST include ALL ${cast.length} active contestants. Every islander in the villa competes in this challenge — no one sits out. The host briefly narrates the rules at the start.`
  } else if (forcedParticipants) {
    participantsClause = `MUST include exactly: ${forcedParticipants.join(', ')}`
  } else {
    participantsClause = 'Choose 3-5 dramatically relevant contestants from the cast. Vary the picks across scenes; do not always feature the same people.'
  }

  // Scene-type-specific direction
  let direction: string
  if (isIntroduction) {
    direction = `SEASON OPENER. ORDER OF EVENTS:
1. HOST speaks first (1-2 lines) — theatrical welcome to the villa, sets the tone.
2. Each contestant speaks ONE line — a self-introduction that captures their personality and what they're looking for.
3. HOST speaks the final line teasing the first mini-game and telling the cast to start getting to know each other.
DO NOT emit any couple_formed events. The cast does NOT pair up yet — they meet each other here, then build attraction and trust through the next several scenes before they decide who to couple with at the grace recouple later in the season. Sprinkle in subtle attraction_change deltas (+3 to +8) between unexpected pairs based on first impressions to seed chemistry.`
  } else if (isFinale) {
    direction = `SEASON FINALE (scene ${sceneNumber}). The host gathers everyone one final time. Reference the season's biggest moments via the contestants' memories. Lock in the winning couple via couple_formed events. The vibe should feel climactic and conclusive.`
  } else if (sceneType === 'interview') {
    direction = `SOLO CONFESSIONAL. ${(cast.find((c) => c.id === interviewSubjectId)?.name) ?? 'The contestant'} is alone in the interview room speaking directly to the audience. They share their REAL thoughts — what they actually feel about recent events, who they are watching, what their strategy is. Candid, unfiltered, no performance for other islanders. Reference their memories and current goal.`
  } else if (sceneType === 'bombshell' && allBombshells.length > 0) {
    const names = allBombshells.map((b) => b.name).join(' and ')
    const isDouble = allBombshells.length > 1
    direction = `BOMBSHELL ARRIVAL${isDouble ? ' — DOUBLE TROUBLE' : ''}. ${names} walk${isDouble ? '' : 's'} into the villa for the first time.

STRUCTURE:
1. Host (2 lines) — dramatic build-up: "Islanders... I've got a text!" then reads the text announcing ${isDouble ? 'TWO new arrivals' : 'a new arrival'}, hypes the entrance.
2. ${isDouble ? 'Each bombshell walks in and introduces themselves (2-3 lines total)' : 'The bombshell walks in (1-2 lines)'} — confident entrance, first impressions, sizing up the villa.
3. Cast reacts (3-4 lines) — mix of intrigued, threatened, couples pulling their partner closer, singles perking up.${isDouble ? ' The double arrival creates EXTRA chaos — heads are turning in multiple directions.' : ''}
4. Host (1 line) — teases what's coming: "They'll be going on dates with some of you very soon..."

DO NOT emit couple_formed or couple_broken events. ${isDouble ? 'The bombshells do' : 'The bombshell does'} NOT couple up yet — like on the real show, they get a dating period to explore chemistry before choosing at the next recoupling. Emit attraction_change events (+3 to +8) between ${isDouble ? 'each bombshell' : 'the bombshell'} and 2-3 different contestants to seed early chemistry.`
  } else if (sceneType === 'minigame') {
    direction = `MINI GAME. You invent the specific game (examples: "truth or flirt", "kiss marry dump", "couple trivia", "oil wrestling", "human pyramid", "blindfold kisses", "snog marry pie"). Give it a SPECIFIC name in the dialogue.

STRUCTURE (must follow this arc):
1. Host (2-3 lines) — introduces the game by name, explains the rules clearly, hypes the stakes ("the winning couple gets a special reward date...").
2. The game plays out across 3-4 competitive banter lines from different contestants.
3. Host (1-2 lines) — builds suspense then announces the WINNING pair by name: "and tonight's winners are... [NAME] and [NAME]!"
4. 2-3 REACTION lines from losers and other contestants — jealousy, congratulations, side-eye, trash talk. Different personalities react differently.

You MUST emit a minigame_win system event with fromId and toId = the two winning contestants. Also emit an attraction_change bond boost between the winning couple. Losers can have small jealousy spikes toward the winners.

THE OUTCOME LINE MUST NAME THE WINNING PAIR EXPLICITLY. Example: "Maya and Liam take the crown, leaving Theo seething in the corner."`
  } else if (sceneType === 'challenge') {
    direction = `VILLA CHALLENGE. EVERY active contestant participates. You invent the specific challenge (examples: "couples obstacle course", "mr & mrs quiz", "tug of war", "aerial silk trust fall", "charades with partners", "escape room"). Give it a SPECIFIC name in the dialogue.

STRUCTURE:
1. Host (2-3 lines) — introduces the challenge by name, explains rules in detail, sets up the stakes.
2. 4-5 competitive lines from different couples showing banter, teamwork, and at least one surprise twist (a couple falling apart under pressure, or a dark-horse pair rising up).
3. Host (1-2 lines) — builds suspense, then names the WINNING pair: "tonight's champions are... [NAME] and [NAME]!"
4. 2-3 REACTION lines from the losers — sore losers, gracious congratulations, jealousy spikes, side-eye. Use each loser's personality.

You MUST emit a challenge_win system event with fromId + toId = the two winning contestants (BIG reward). Also emit a strong attraction_change between winners and small jealousy_spike events from losers toward them.

THE OUTCOME LINE MUST NAME THE WINNING PAIR. Example: "Priya and Kai win the villa challenge — the others exchange looks."`
  } else if (sceneType === 'date' && isRewardDate && rewardDateCoupleNames) {
    const [nameA, nameB] = rewardDateCoupleNames
    direction = `REWARD DATE. ${nameA} and ${nameB} won the last challenge and this is their prize — a private date away from the villa. ONLY the two of them appear in this scene (no other contestants, no host). The vibe is sweet and earned — they can be flirty, vulnerable, or strategic. Emit a noticeable attraction_change and trust_change between them to reflect the bond boost from the date.`
  } else {
    // Add a per-call wildcard directive so filler scenes don't feel generic.
    const WILDCARDS = [
      'Someone tells a small lie that they\'ll regret later.',
      'Two contestants who rarely talk share an unexpected moment.',
      'Someone gives surprisingly good advice to a rival.',
      'A small misunderstanding spirals into a bigger tension.',
      'Someone confesses a vulnerability they\'ve been hiding.',
      'A quiet power move — one contestant outmaneuvers another.',
      'Someone catches another contestant in a lie.',
      'A joke lands badly and reveals something real.',
      'An alliance is subtly tested.',
      'Someone is noticeably changing their strategy this scene.',
    ]
    const wildcard = WILDCARDS[Math.floor(Math.random() * WILDCARDS.length)]!
    direction = `Push the story forward (scene ${sceneNumber}). Do not retread previous scenes. Introduce conflict, surprise alliances, secret confessions, or shifting attractions.

WILDCARD DIRECTIVE FOR THIS SCENE: ${wildcard}`
  }

  const recoupleHint = isFinale
    ? '\n- This is the SEASON FINALE. The host delivers the verdict of who wins the season with maximum drama — reference the season\'s biggest moments by name. You MUST emit couple_formed events that lock in the final pairings.'
    : sceneType === 'recouple'
    ? '\n- This is a RECOUPLING. The host DRIVES the entire ceremony with at least 3-4 host lines:\n  1. Opens with "Islanders, it\'s time for a recoupling" and sets the stakes\n  2. Calls each person forward one by one to make their choice, building suspense\n  3. Announces who is at risk / "you are now vulnerable"\n  4. Delivers the elimination verdict with gravity\n  EVERY non-choosing contestant MUST react to each coupling announcement — gasps, whispers, sighs, eye-rolls, nervous laughter. These reactions show the audience how the villa FEELS about each pick.\n  You MUST emit couple_formed events for who couples up. Each active contestant should ideally end up in one couple. Emit couple_broken if any prior couples are split.'
    : ''

  // Which agent ids are valid for this scene's dialogue/events
  const validIds = [
    ...cast.map((a) => a.id),
    ...(host ? [host.id] : []),
    ...allBombshells.map((b) => b.id),
  ]

  // Line count rule depends on scene type
  const lineCountRule = isIntroduction
    ? `Exactly ${cast.length + 2} dialogue lines: 1 host opening + ${cast.length} contestant self-intros + 1 host pairing announcement.`
    : isFinale
    ? '8 to 12 dialogue lines for the climactic finale. Every remaining contestant must speak at least once.'
    : sceneType === 'interview'
    ? '3 to 5 dialogue lines — ALL from the single interview subject. No one else speaks.'
    : sceneType === 'bombshell'
    ? '7 to 10 dialogue lines total covering host intro, bombshell entrance, cast reactions, and the steal moment.'
    : sceneType === 'minigame'
    ? '6 to 9 dialogue lines — rotating between the competing couples with the host narrating briefly.'
    : sceneType === 'recouple'
    ? `10 to ${Math.max(12, cast.length + 4)} dialogue lines. The host needs 3-4 lines. Every contestant must react to at least one coupling announcement.`
    : sceneType === 'challenge'
    ? '8 to 12 dialogue lines — host opens and closes, every contestant competes and reacts.'
    : '6 to 10 dialogue lines total.'

  return `You are the writers room for "Villa AI", a parody reality TV dating show in the style of Love Island. Generate ONE scene as strict JSON.

## SEASON ANGLE (drives the whole show)
${seasonTheme}
${buildPastSeasonsPromptBlock()}
## CAST (active contestants only)
${castBlock}${hostBlock}${bombshellBlock}

## CURRENT RELATIONSHIPS (0-100)
${relsBlock}

## CURRENT EMOTIONS
${emotionsBlock}

## CURRENT COUPLES
${couplesBlock}

## RECENT SCENES
${recentBlock}

## EACH CONTESTANT'S MEMORY + GOAL + STRATEGY
These are the personal observations each contestant has formed, what they're trying to do, and the current strategy they've committed to after reflecting on what has and hasn't worked for them. Use them to make dialogue feel personal, continuity-aware, and strategic. When a contestant speaks, they should sound like someone who actually remembers what's happened and is acting on a real plan.
${brainBlock}

## THIS SCENE (number ${sceneNumber})
Type: ${sceneType}
Title: ${sceneInfo.title}
Participants: ${participantsClause}
Direction: ${direction}

## RULES
- Output ONLY a single JSON object. No prose, no markdown fences, no commentary.
- ${lineCountRule}
- Reality TV pacing: short, punchy, quotable. Keep most lines under 18 words.
- Each line must include emotion. Optionally include action (physical action like "leans in").
- Each line should include targetAgentId when one contestant is speaking to another specific person. (Host lines may skip targetAgentId. Interview lines MUST skip targetAgentId.)
- Include 2 to 5 systemEvents with deltas in the range -15 to +15.
- Every delta must be justified by what was said in the dialogue.
- Stay in character voices. No fourth wall EXCEPT in interview scenes where the subject speaks directly to the audience.
- Outcome: one sentence that hooks the next scene.
- Use ONLY these agentIds: ${validIds.join(', ')}.
- Use ONLY these emotions: happy, flirty, jealous, angry, sad, smug, anxious, bored, shocked, neutral.
- Use ONLY these systemEvent types: trust_change, attraction_change, jealousy_spike, couple_formed, couple_broken, minigame_win, challenge_win.
- NEVER mention specific stat numbers, percentages, or scores in dialogue. Contestants do NOT know their trust/attraction/jealousy numbers. Express feelings naturally through words and behavior. BAD: "I feel like my trust has increased by +25." GOOD: "I really feel like I can trust you now."${recoupleHint}

## JSON SCHEMA
{
  "dialogue": [
    {"agentId": string, "text": string, "emotion": string, "action": string?, "targetAgentId": string?}
  ],
  "systemEvents": [
    {"type": string, "fromId": string?, "toId": string?, "delta": number?, "label": string}
  ],
  "emotionUpdates": [
    {"agentId": string, "primary": string, "intensity": number}
  ],
  "outcome": string
}`
}
