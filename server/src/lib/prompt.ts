import type {
  Agent,
  BuildArgs,
  PlannedBeat,
  SceneContext,
} from "@villa-ai/shared";
import { SCENE_LABELS } from "./environments.js";
import { buildPastSeasonsPromptBlock } from "./trainingData.js";
import { VOICE_EXAMPLES } from "./castGenerator.js";

// Re-export for callers that want the prompt-specific shapes without
// reaching into shared/ directly.
export type {
  BuildArgs,
  RecouplePlanStep,
  RecoupleScript,
  MinigameDefinition,
} from "@villa-ai/shared";

// Sanitize any string flowing into the LLM prompt body. Collapses whitespace,
// strips control chars, and caps length so a crafted cast bio or dialogue line
// can't escape its section and hijack the system rules or JSON schema.
function clip(value: string | undefined, maxLen: number): string {
  if (!value) return "";
  const flat = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\x00-\x1f\x7f]/g, "")
    .trim();
  return flat.length > maxLen ? flat.slice(0, maxLen - 1) + "…" : flat;
}

// Turn the SceneContext (produced by sceneEngine.ts) into a prompt section.
// Replaces the old SCENE ARC / YELLING / CHARACTER-DRIVEN lecture blocks
// with structured per-beat direction so the LLM follows a specific shape
// instead of a prose brief.
function renderSceneContextBlock(
  ctx: SceneContext | undefined,
  cast: Agent[],
): string {
  if (!ctx) return ""; // scene engine disabled or upstream bailed; let other prompt sections carry it
  // Names flow into the highest-priority prompt section, so clip them the same
  // way we clip bios/dialogue — if a session was ever restored from untrusted
  // storage, a crafted name must not be able to inject instructions here.
  const nameOf = (id: string | undefined) =>
    clip(id ? (cast.find((a) => a.id === id)?.name ?? id) : "", 60);
  const tensionLabel =
    ctx.tension >= 70 ? "HIGH" : ctx.tension >= 40 ? "medium" : "low";

  const rolesBlock = ctx.roles
    .map((r) => {
      const name = nameOf(r.agentId);
      const hidden = r.hiddenAgenda
        ? `\n    hidden agenda: ${clip(r.hiddenAgenda, 160)}`
        : "";
      return `- ${name} [${r.powerPosition}]
    goal: ${clip(r.goal, 160)}${hidden}
    surface: ${clip(r.subtext.surface, 160)}
    actually means: ${clip(r.subtext.actual, 160)}
    stakes — gain: ${clip(r.stakes.whatCanBeGained, 120)} | lose: ${clip(r.stakes.whatCanBeLost, 120)}`;
    })
    .join("\n");

  const beatsBlock = ctx.plannedBeats
    .map((b, idx) => renderBeat(b, idx, nameOf))
    .join("\n");

  // CAPS/yelling directive is now conditional: only emit when the plan
  // includes a loud beat, and only apply to that specific beat index.
  const loudBeatIndices = ctx.plannedBeats
    .map((b, idx) => (b.loud ? idx : -1))
    .filter((i) => i >= 0);
  const yellingDirective =
    loudBeatIndices.length > 0
      ? `\n\n## PEAK MOMENT STYLING (beat index ${loudBeatIndices.join(", ")} ONLY)
On those specific beats — and ONLY those beats — let the speaker LOSE IT:
- ALL CAPS for the yelled words in the line
- stacked exclamation marks (!! or !?!) on the loudest line
- action field for physical punctuation: "stands up", "slams cup", "walks out"
Every other beat is normal volume. One or two loud beats per scene is the ceiling — CAPS in a scene where nothing else is loud is what makes it hit.`
      : ctx.sceneType === "grand_finale"
        ? `\n\n## EMOTIONAL PEAK (sentimental — no yelling)
The peak here is tearful, not angry. Trailing ellipses ("I... I never thought..."), voice-breaking confessions, quiet gut-punches ("you saved this season for me"). Action field for embraces, wiping tears. NO all-caps yelling. NO stacked exclamation marks.`
        : "";

  return `## SCENE CONTEXT (CRITICAL — follow this shape, do not improvise around it)
Recent event: ${clip(ctx.recentEvent, 200)}
Power dynamic: ${clip(ctx.powerDynamic, 200)}
Tension: ${ctx.tension}/100 (${tensionLabel})
Dialogue pattern: ${ctx.pattern.replace(/_/g, " ")}

### Per-participant direction
${rolesBlock}

### Planned beats (hit each one in order; you may add 1 reactive micro-line between beats, but do not skip)
${beatsBlock}${yellingDirective}

## BEAT EXECUTION RULES
- Every dialogue line MUST include an \`intent\` field matching one of the planned beat intents.
- Every dialogue line MUST include a \`beatIndex\` pointing to the planned beat it satisfies (0-indexed).
- You MAY add 1 short reactive line between beats — tag it with the most-fitting intent and the surrounding beatIndex.
- Characters DO NOT say what they actually mean (see "actually means" above) unless the beat intent is \`confess\` / \`reveal\` / \`declare\`.`;
}

function renderBeat(
  beat: PlannedBeat,
  idx: number,
  nameOf: (id: string | undefined) => string,
): string {
  const targetClause = beat.target ? ` → ${nameOf(beat.target)}` : "";
  const loudMark = beat.loud ? " [LOUD beat — CAPS/!! permitted here]" : "";
  return `${idx}. ${nameOf(beat.speakerId)}${targetClause}: ${beat.intent}. tone: ${beat.emotionalTone}${loudMark}`;
}

export async function buildScenePrompt(args: BuildArgs): Promise<string> {
  const {
    cast,
    host,
    relationships,
    emotions,
    couples,
    recentScenes,
    sceneType,
    seasonTheme,
    sceneNumber,
    forcedParticipants,
    isIntroduction,
    isFinale,
    agentMemories,
    agentGoals,
    agentPolicies,
    arrivingBombshell,
    arrivingBombshells,
    interviewSubjectId,
    competingCoupleIds,
    isRewardDate,
    rewardDateCoupleNames,
    eliminationNarrative,
    eliminatedNames,
    challengeCategory,
    casaAmorCast,
    casaAmorCoupleArchetypes,
    grandFinaleRanking,
    sceneContext,
    recoupleScript,
    minigameDefinition,
    outline,
  } = args;
  const sceneInfo = SCENE_LABELS[sceneType];

  const allCast =
    casaAmorCast && casaAmorCast.length > 0 ? [...cast, ...casaAmorCast] : cast;

  // NO style samples in the cast block. Every previous attempt to include
  // them (as `example line:` or `style sample:`) resulted in the LLM
  // copying the literal string as a dialogue line — Zion kept getting
  // "Wait, wait, WAIT. Did she just say that?" because that was the
  // "dramatic AF" sample shown in quotes on his row. The `voice:`
  // description field below carries the same signal without giving the
  // model any ready-made string to paste. Also saves ~240 tokens per
  // prompt (8 cast × 30 tokens/sample).
  const castBlock = allCast
    .map((a) => {
      return `- ${a.id} (${clip(a.name, 60)}, ${a.age}) [${clip(a.archetype, 60)}]\n  voice: ${clip(a.voice, 160)}\n  bio: ${clip(a.bio, 220)}\n  traits: ${clip(a.personality, 200)}`;
    })
    .join("\n");

  let hostIntel = "";
  if (host) {
    const tensions: string[] = [];
    for (const c of couples) {
      const ab = relationships.find((r) => r.fromId === c.a && r.toId === c.b);
      const ba = relationships.find((r) => r.fromId === c.b && r.toId === c.a);
      const avgTrust = ((ab?.trust ?? 50) + (ba?.trust ?? 50)) / 2;
      if (avgTrust < 30) {
        const nameA = cast.find((x) => x.id === c.a)?.name ?? c.a;
        const nameB = cast.find((x) => x.id === c.b)?.name ?? c.b;
        tensions.push(
          `${nameA} and ${nameB}'s trust is fragile — the host senses cracks`,
        );
      }
    }
    const highJealousy = relationships
      .filter(
        (r) =>
          r.jealousy >= 40 &&
          cast.some((c) => c.id === r.fromId) &&
          cast.some((c) => c.id === r.toId),
      )
      .sort((a, b) => b.jealousy - a.jealousy)
      .slice(0, 2);
    for (const r of highJealousy) {
      const fromName = cast.find((c) => c.id === r.fromId)?.name ?? r.fromId;
      const toName = cast.find((c) => c.id === r.toId)?.name ?? r.toId;
      tensions.push(
        `${fromName} is jealous of ${toName} — the host can exploit this`,
      );
    }
    // Compatibility mismatch — high attraction but low compatibility = ticking time bomb
    for (const c of couples) {
      const ab = relationships.find((r) => r.fromId === c.a && r.toId === c.b);
      const ba = relationships.find((r) => r.fromId === c.b && r.toId === c.a);
      const avgAttraction = ((ab?.attraction ?? 0) + (ba?.attraction ?? 0)) / 2;
      const avgCompat =
        ((ab?.compatibility ?? 40) + (ba?.compatibility ?? 40)) / 2;
      if (avgAttraction > 55 && avgCompat < 30) {
        const nameA = cast.find((x) => x.id === c.a)?.name ?? c.a;
        const nameB = cast.find((x) => x.id === c.b)?.name ?? c.b;
        tensions.push(
          `${nameA} and ${nameB} have chemistry but LOW compatibility — a breakup waiting to happen`,
        );
      }
    }
    for (const s of recentScenes) {
      for (const e of s.systemEvents) {
        if (e.type === "couple_broken" && e.label) {
          tensions.push(`Recent drama: ${e.label}`);
        }
      }
    }
    if (tensions.length > 0) {
      hostIntel = `\n  HOST INTEL (reference these tensions in host dialogue):\n  ${tensions
        .slice(0, 4)
        .map((t) => `• ${t}`)
        .join("\n  ")}`;
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
    : "";

  const allBombshells =
    arrivingBombshells ?? (arrivingBombshell ? [arrivingBombshell] : []);

  // Flattened list of every id the validator will accept. We put this in
  // the prompt so the LLM never guesses at ids from the name field —
  // models love to write "Omar" as agentId when given a block that shows
  // both id and name, and the validator throws those lines away silently.
  const allValidIds: string[] = [
    ...allCast.map((a) => a.id),
    ...allBombshells.map((a) => a.id),
    ...(host ? [host.id] : []),
  ];
  const validIdsList = allValidIds.join(", ");

  // When the scene requires specific speakers (intros, first coupling,
  // ensemble scenes), spell them out at the end of the ID block so the LLM
  // can't silently skip anyone. The prompt's scene-direction section
  // already says "every contestant must speak" in English — this is the
  // enforcement version.
  const requiredSpeakers: string[] = (() => {
    if (isIntroduction || forcedParticipants === undefined) {
      if (isIntroduction) return allCast.map((a) => a.id);
      return [];
    }
    return forcedParticipants;
  })();
  const mandatorySpeakersBlock =
    requiredSpeakers.length > 0
      ? `\n\nMANDATORY SPEAKERS — every id below MUST appear as agentId on at least one dialogue line in your response. Skipping any of these means the contestant is missing from the scene on screen: ${requiredSpeakers.join(", ")}`
      : "";
  const bombshellBlock =
    allBombshells.length > 0
      ? `\n## ARRIVING BOMBSHELL${allBombshells.length > 1 ? "S" : ""} (new contestant${allBombshells.length > 1 ? "s" : ""} walking in THIS scene)\n` +
        allBombshells
          .map(
            (b) =>
              `- ${b.id} (${clip(b.name, 60)}, ${b.age}) [${clip(b.archetype, 60)}]\n  voice: ${clip(b.voice, 160)}\n  bio: ${clip(b.bio, 220)}\n  traits: ${clip(b.personality, 200)}`,
          )
          .join("\n")
      : "";

  const relsBlock = relationships
    .filter(
      (r) =>
        allCast.some((c) => c.id === r.fromId) &&
        allCast.some((c) => c.id === r.toId),
    )
    .map(
      (r) =>
        `${r.fromId}->${r.toId}: trust ${r.trust}, attraction ${r.attraction}, jealousy ${r.jealousy}, compatibility ${r.compatibility}`,
    )
    .join("\n");

  const emotionsBlock = emotions
    .filter((e) => allCast.some((c) => c.id === e.agentId))
    .map((e) => `${e.agentId}: ${e.primary} (${e.intensity})`)
    .join("\n");

  const couplesBlock =
    couples.length > 0
      ? couples.map((c) => `- ${c.a} & ${c.b}`).join("\n")
      : "No couples yet (early days, mingling phase)";

  const recentBlock =
    recentScenes.length > 0
      ? recentScenes
          .map((s, i) => {
            const keyEvents = s.systemEvents
              .filter(
                (e) =>
                  e.type === "couple_formed" ||
                  e.type === "couple_broken" ||
                  e.type === "minigame_win" ||
                  e.type === "challenge_win",
              )
              .map((e) => `    [${e.type}] ${clip(e.label, 160)}`)
              .slice(0, 3);
            const keyLines = s.dialogue
              .filter((d) => (d.text?.length ?? 0) > 20)
              .slice(0, 2)
              .map((d) => `    "${clip(d.text, 220)}" — ${d.agentId}`);
            return `Scene ${i + 1} (${s.type}): ${clip(s.outcome, 240)}${keyEvents.length > 0 ? "\n" + keyEvents.join("\n") : ""}${keyLines.length > 0 ? "\n" + keyLines.join("\n") : ""}`;
          })
          .join("\n")
      : "No prior scenes. This is the season opener.";

  const castWithArrivals: Agent[] =
    allBombshells.length > 0 ? [...allCast, ...allBombshells] : allCast;
  const brainParticipants = forcedParticipants
    ? castWithArrivals.filter((c) => forcedParticipants.includes(c.id))
    : castWithArrivals;
  // Only include a brain section for participants who actually HAVE
  // something (a memory, a goal, or a policy). Early scenes have none of
  // these and the default "no specific memories yet" block adds ~50 tokens
  // per contestant for zero value — that's ~400+ wasted tokens on scene 1
  // which directly slows generation.
  const brainEntries = brainParticipants
    .map((p) => {
      const goal = clip(agentGoals?.[p.id], 200);
      const policy = clip(agentPolicies?.[p.id], 200);
      const mems = agentMemories?.[p.id] ?? [];
      if (!goal && !policy && mems.length === 0) return null;
      const memList = mems
        .map(
          (m) =>
            `    • [${m.type}, importance ${m.importance}] ${clip(m.content, 200)}`,
        )
        .join("\n");
      const goalLine = goal ? `\n  goal: ${goal}` : "";
      const policyLine = policy ? `\n  current strategy: ${policy}` : "";
      const memBlock = memList ? `\n  memories:\n${memList}` : "";
      return `- ${clip(p.name, 60)} (${p.id})${goalLine}${policyLine}${memBlock}`;
    })
    .filter((s): s is string => s !== null);
  const brainBlock = brainEntries.join("\n");
  const hasBrainContent = brainEntries.length > 0;

  let participantsClause: string;
  if (isIntroduction) {
    participantsClause = `MUST include the host AND all ${cast.length} contestants. The host speaks first, then each contestant introduces themselves, then the host announces the initial pairings.`;
  } else if (isFinale) {
    participantsClause = `MUST include the host AND all ${cast.length} remaining contestants. The host leads the ceremony, the contestants speak in turn.`;
  } else if (sceneType === "interview" && interviewSubjectId) {
    const subj = cast.find((c) => c.id === interviewSubjectId);
    participantsClause = `MUST be a solo confessional. ONLY ${subj?.name ?? interviewSubjectId} (${interviewSubjectId}) speaks. 3 to 5 dialogue lines, ALL from them. NO targetAgentId — they are talking directly to the audience/camera. NO other agents.`;
  } else if (sceneType === "bombshell" && allBombshells.length > 0) {
    const bombNames = allBombshells
      .map((b) => `${b.name} (${b.id})`)
      .join(" and ");
    participantsClause = `MUST include ${allBombshells.length > 1 ? "the bombshells" : "the bombshell"} ${bombNames} AND all active contestants. ${allBombshells.length > 1 ? "The bombshells arrive together, creating double the chaos." : "The bombshell arrives"}, mingles, and gets a feel for everyone — they do NOT immediately couple up. They will go on dates in the next few scenes before choosing at the next recoupling.`;
  } else if (sceneType === "minigame") {
    const coupleDesc =
      competingCoupleIds && competingCoupleIds.length > 0
        ? competingCoupleIds
            .map(
              (c) =>
                `${cast.find((x) => x.id === c[0])?.name}+${cast.find((x) => x.id === c[1])?.name}`,
            )
            .join(" vs ")
        : "no couples formed yet — pair singles ad hoc";
    const allNames = cast.map((c) => c.name).join(", ");
    participantsClause = `MUST include ALL ${cast.length} active contestants. Existing couples compete together (${coupleDesc}); singles are paired ad hoc for the game only (no state change). You MUST include at least one dialogue line from EVERY contestant. Required speakers: ${allNames}. The host narrates the rules at the start.`;
  } else if (sceneType === "challenge") {
    participantsClause = `MUST include ALL ${cast.length} active contestants. Every islander in the villa competes in this challenge — no one sits out. The host briefly narrates the rules at the start.`;
  } else if (forcedParticipants) {
    participantsClause = `MUST include exactly: ${forcedParticipants.join(", ")}`;
  } else {
    participantsClause =
      "Choose 3-5 dramatically relevant contestants from the cast. Vary the picks across scenes; do not always feature the same people.";
  }

  let direction: string;
  if (isIntroduction) {
    // Introductions scene — host-led, cast intros, light banter.
    // This prompt is deliberately tight: the opener sets the tone for
    // the whole season, and noise here (drama, flirting, couplings) makes
    // later scenes feel repetitive. Tune the beat counts/banter level
    // here if you want the opener to feel more/less chatty.
    direction = `SEASON OPENER — "INTRODUCTIONS" scene. This scene is an ACTUAL round of self-introductions where each contestant says WHO THEY ARE out loud. It is NOT a dramatic hang-out scene. Do not skip the self-intros in favor of drama — the self-intros ARE the scene.

ORDER OF EVENTS:

1. HOST speaks first (1-2 lines) — theatrical welcome to the villa, sets the tone. Example shape: "Welcome to Villa AI. Eight gorgeous singletons, one summer, one chance at finding the one. Let's meet your islanders." (Don't copy this verbatim — write your own version in the host's voice.)

2. EACH CONTESTANT speaks ONE self-introduction line. There must be EXACTLY ${cast.length} self-intro lines (one per contestant). Every self-intro MUST include:
   • Name ("I'm Omar...")
   • Age ("...I'm 28...")
   • Hometown or where they're from ("...from Manchester.")
   • A voice-y hook that captures who they are and what they're here for.

   Example self-intro lines (write each contestant's in THEIR OWN voice — don't copy):
   - "Hiya, I'm Maya, I'm 24, from Leeds. I've been called high-maintenance before and honestly? I think I'm worth it."
   - "Right, I'm Callum, 26, from Belfast. I'm a PE teacher by day, and a menace by night. Let's see what happens."
   - "Hey everyone — I'm Amara, 22, from London. I'm a soft girl with a hard opinion. Try me."

   Go in a natural order (not alphabetical) — whoever the host gestures to next.

3. LIGHT BANTER — ${Math.max(2, Math.min(4, Math.floor(cast.length / 2)))} short reactive lines sprinkled BETWEEN intros (not clumped at the end). Examples: a compliment on someone's accent, a laugh at a bold hook, a playful "watch out for that one". Keep them warm — no shade, no flirting yet, no rivalries. These break up intro rhythm so it doesn't read as a checklist.

4. HOST speaks the final 1-2 lines — warm close, teases what's coming ("right, get to know each other, and we'll see you at the firepit later").

HARD RULES for this scene:
- EVERY contestant MUST have a self-intro line. Skipping any contestant breaks the scene. Refer to the MANDATORY SPEAKERS list above — every id on it needs at least one line.
- Self-intros MUST sound like introductions. "Hiya, I'm [name], I'm [age], from [place]" is the FORMAT. Adding a voice-y tag after ("...and I'm here to cause chaos") is encouraged. Writing a generic flirty aside INSTEAD of an intro is a FAILURE.
- DO NOT emit any couple_formed or couple_broken events. Pairings happen scenes later.
- No deep flirting ("you're cute" is the ceiling — save the heat for later scenes).
- No drama, jealousy, or rivalries — they literally just met.
- Emit subtle attraction_change deltas (+3 to +8) between 2-4 unexpected pairs based on first impressions — seeds chemistry the coupling ceremony can draw on.`;
  } else if (isFinale) {
    direction = `SEASON FINALE (scene ${sceneNumber}). The host gathers everyone one final time. Reference the season's biggest moments via the contestants' memories. Lock in the winning couple via couple_formed events. The vibe should feel climactic and conclusive.`;
  } else if (sceneType === "interview") {
    direction = `SOLO CONFESSIONAL. ${cast.find((c) => c.id === interviewSubjectId)?.name ?? "The contestant"} is alone in the interview room speaking directly to the audience. They share their REAL thoughts — what they actually feel about recent events, who they are watching, what their strategy is. Candid, unfiltered, no performance for other islanders. Reference their memories and current goal.`;
  } else if (sceneType === "bombshell" && allBombshells.length > 0) {
    const names = allBombshells.map((b) => b.name).join(" and ");
    const isDouble = allBombshells.length > 1;
    direction = `BOMBSHELL ARRIVAL${isDouble ? " — DOUBLE TROUBLE" : ""}. ${names} walk${isDouble ? "" : "s"} into the villa for the first time.

STRUCTURE:
1. Host (2 lines) — dramatic build-up: "Islanders... I've got a text!" then reads the text announcing ${isDouble ? "TWO new arrivals" : "a new arrival"}, hypes the entrance.
2. ${isDouble ? "Each bombshell walks in and introduces themselves (2-3 lines total)" : "The bombshell walks in (1-2 lines)"} — confident entrance, first impressions, sizing up the villa.
3. Cast reacts (3-4 lines) — mix of intrigued, threatened, couples pulling their partner closer, singles perking up.${isDouble ? " The double arrival creates EXTRA chaos — heads are turning in multiple directions." : ""}
4. Host (1 line) — teases what's coming: "They'll be going on dates with some of you very soon..."

DO NOT emit couple_formed or couple_broken events. ${isDouble ? "The bombshells do" : "The bombshell does"} NOT couple up yet — like on the real show, they get a dating period to explore chemistry before choosing at the next recoupling. Emit attraction_change events (+3 to +8) between ${isDouble ? "each bombshell" : "the bombshell"} and 2-3 different contestants to seed early chemistry.`;
  } else if (sceneType === "date" && isRewardDate && rewardDateCoupleNames) {
    const [nameA, nameB] = rewardDateCoupleNames;
    direction = `REWARD DATE. ${nameA} and ${nameB} won the last challenge and this is their prize — a private date away from the villa. ONLY the two of them appear in this scene (no other contestants, no host). The vibe is sweet and earned — they can be flirty, vulnerable, or strategic. Emit a noticeable attraction_change and trust_change between them to reflect the bond boost from the date.`;
  } else if (sceneType === "date" && !isRewardDate) {
    direction = `DATE NIGHT — ONE PAIRING ONLY.

This scene is focused on a SINGLE couple's evening together. It is NOT an ensemble scene. No one else speaks. The couple talks about themselves — the state of their relationship, what they're feeling, what's worrying them, any drama they're currently tangled in, what they want from the other person. Let them confess, argue softly, flirt, or have a real moment of vulnerability.

STRUCTURE:
1. Small talk that warms into something realer (2-3 lines).
2. One partner raises the SPECIFIC current-drama thread hanging over them (a recent jealousy spike, a bombshell they noticed, something said in a past scene). 2-3 lines.
3. The other partner responds — defensive, honest, reassuring, or cracking.
4. A genuine moment lands (vulnerability, declaration, a joke that cuts, a quiet "I don't know what this is").

NO other contestants. NO host. Focus entirely on THEM and THEIR current situation. Reference brain memories of prior beats between them. Emit attraction_change and trust_change reflecting how the conversation actually went.`;
  } else if (sceneType === "recouple" && !isFinale) {
    // First recouple of the season = "First Coupling". Nobody's paired yet,
    // nobody goes home — the vibe is "pick your partner" not "one of you is
    // leaving tonight". Different opener + different script framing. The
    // caller passes isFirstCoupling explicitly (see BuildArgs) because
    // recentScenes here is a windowed slice and can't distinguish scene-2
    // first-coupling from a late-season recouple whose last recouple is
    // outside the window.
    const isFirstCoupling = args.isFirstCoupling === true;
    const scriptBlock =
      recoupleScript && recoupleScript.steps.length > 0
        ? `\n\nPRE-DETERMINED PAIRING ORDER (follow this sequence EXACTLY — do not invent other pairings):\n${recoupleScript.steps
            .map(
              (s, i) =>
                `  ${i + 1}. Host calls ${clip(s.chooserName, 60)} forward → ${clip(s.chooserName, 60)} picks ${clip(s.partnerName, 60)} (reason the chooser can use: ${clip(s.rationale, 120)}) → Host confirms, emit couple_formed(fromId=${s.chooserId}, toId=${s.partnerId})`,
            )
            .join("\n")}${
            recoupleScript.unpairedName && !isFirstCoupling
              ? `\n  ${recoupleScript.steps.length + 1}. Host announces ${clip(recoupleScript.unpairedName, 60)} has not been chosen — they are going home.`
              : ""
          }\n`
        : "";

    if (isFirstCoupling) {
      direction = `FIRST COUPLING — the villa's opening ceremony. This is NOT a recoupling. Nobody's paired yet, NOBODY is going home tonight, nobody is getting eliminated. The vibe is: "based on the first couple days of mingling, pick who you want to couple up with". Excited, slightly nervous, full of possibility.${scriptBlock}

MANDATORY SHAPE (use the REAL NAMES from the PRE-DETERMINED PAIRING ORDER above — NEVER write literal placeholders like "[Name]" or "[Name A]"):
1. HOST opens (1-2 lines): something like "Islanders, it's time for your FIRST coupling. You've spent the last couple days getting a feel for each other — now it's time to pick who you want to couple up with. And remember, couples can always change down the line."
2. FOR EACH COUPLE in the pairing order (repeat per pair):
   a. HOST calls the CHOOSER forward by real name.
   b. The CHOOSER gives a short reason (1-2 lines) — references a specific moment or vibe from the recent mingling scenes (an in-joke from the pool, a conversation at the firepit, a look across the kitchen). Flirty, nervous, playful. Short history is fair game now.
   c. HOST confirms in ONE line using both real names: e.g. "Maren and Kaia, you are now a couple." Emit a couple_formed event. 1 OTHER contestant may react briefly.
3. HOST closes with an upbeat line teasing what's coming ("let's see if these pairs last the week").

RULES:
- NEVER write "recoupling" or reference anyone going home — this is the FIRST coupling, nobody's leaving.
- NEVER write literal bracket placeholders like "[Name]". Always use real names from the script.
- The HOST MUST appear in AT LEAST half the lines. The host runs this.
- NO self-introductions — that was scene 1, the contestants already know each other by now.
- Every pick MUST produce a couple_formed system event.
- DO NOT emit couple_broken events (no couples exist yet to break).`;
    } else {
      direction = `RECOUPLING — A 1-BY-1 PAIRING CEREMONY DRIVEN BY THE HOST. NOT a drama scene. NOT a monologue from one contestant.${scriptBlock}

The host runs this like a ceremony. Every single pairing is ANNOUNCED by the host and explained before the next one happens. This is procedural, suspenseful, and the camera (i.e. the dialogue focus) cycles through everyone.

MANDATORY SHAPE (use the REAL NAMES from the PRE-DETERMINED PAIRING ORDER above — NEVER write literal placeholders like "[Name]" or "[Name A]"):
1. HOST opens (1-2 lines): "Islanders, it's time for a recoupling. You all know what this means — tonight one of you will be going home."
2. THEN, FOR EACH COUPLE in the pairing order (repeat this 3-step mini-cycle per pair):
   a. HOST calls the CHOOSER forward using their actual name from the script above.
   b. The CHOOSER gives their reason (1-2 lines) — references the rationale from the script plus a specific moment from this season.
   c. HOST confirms the pairing in ONE line using both real names: e.g. "Maren and Kaia, you are now officially a couple." Emit a couple_formed event. 1 OTHER contestant may react briefly (1 SHORT line).
3. AFTER ALL PICKS, HOST names the specific unpaired islander from the script above and announces their elimination using their real name.
4. BRIEF farewell (1-2 lines) from the eliminated islander, and ONE reaction from someone close to them.

RULES:
- NEVER write literal bracket placeholders like "[Name]", "[Name A]", "[Contestant]", "[X]" — always substitute the actual name from the script.
- The HOST MUST appear in AT LEAST half the lines. The host is running this.
- No one gives long speeches. The chooser explains in 1-2 lines then the host moves on.
- Every pick MUST produce a couple_formed system event.
- If this breaks an existing couple, emit couple_broken for the broken pair.
- DO NOT let a single contestant dominate. One speaker should not appear more than 3 times.
- DO NOT do self-introductions. The villa knows each other — no "Hey guys, I'm [name], [age] from [city]" lines.
- Drama is FINE but it must flow THROUGH the ceremony structure — not replace it.`;
    }
  } else if (sceneType === "public_vote" && eliminationNarrative) {
    direction = `PUBLIC VOTE ELIMINATION. The public has been voting and the results are in.

STRUCTURE:
1. Host gathers everyone at the firepit with maximum suspense (2-3 lines). "Islanders... I've just received the results of the public vote."
2. Host builds tension — names the bottom 2-3 islanders who received the fewest votes. They must stand.
3. Host announces: ${eliminationNarrative}
4. The eliminated islander (${eliminatedNames}) gives a farewell speech — emotional, honest, maybe bitter.
5. Cast reacts: tears, hugs, relief, shock. Their partner (if any) is devastated or secretly relieved.
6. Final host line teasing what's next.

The person leaving is: ${eliminatedNames}. Write their farewell with real emotion — this is their last moment on the show.`;
  } else if (sceneType === "islander_vote" && eliminationNarrative) {
    direction = `ISLANDER VOTE ELIMINATION. The contestants must choose who leaves.

STRUCTURE:
1. Host announces the twist: "Tonight, the power is in YOUR hands. Each of you will vote for the islander you think should leave." (2 lines)
2. 3-4 lines of islanders discussing, agonizing, some whispering alliances. Show the tension of having to vote out a friend.
3. Host reads the votes one by one, building suspense with each reveal.
4. Host announces: ${eliminationNarrative}
5. The eliminated islander (${eliminatedNames}) reacts — shock, anger, acceptance, or tears.
6. Cast reacts — guilt, relief, some questioning their vote.

The person voted out is: ${eliminatedNames}. Show the emotional weight of being voted out BY YOUR PEERS, not the public.`;
  } else if (sceneType === "producer_twist" && eliminationNarrative) {
    direction = `PRODUCER TWIST. The producers are shaking things up.

STRUCTURE:
1. Host arrives unexpectedly — "Islanders, can everyone gather at the firepit immediately." Serious tone. (2 lines)
2. 2-3 lines of cast speculating nervously — "What's happening?", "I've got a bad feeling about this."
3. Host delivers the bombshell: ${eliminationNarrative}
4. The affected islander (${eliminatedNames}) and the cast react with genuine shock — this came out of NOWHERE.
5. Brief farewell, then host teases "and that's not the only twist coming..."

${eliminatedNames} is leaving. This should feel UNFAIR and unexpected — the producers are playing god and everyone knows it.`;
  } else if (sceneType === "casa_amor_arrival" && casaAmorCast) {
    const newNames = casaAmorCast.map((a) => a.name).join(", ");
    direction = `CASA AMOR TWIST! The villa is being SPLIT IN TWO.

STRUCTURE:
1. Host gathers everyone (2-3 lines) — "Islanders... I have a HUGE announcement. Tonight, EVERYTHING changes."
2. Host reveals: half the cast will stay in the main villa, the other half will go to CASA AMOR — a brand new villa with brand new people.
3. Cast reacts with shock, anxiety, excitement (3-4 lines). Couples hold each other tighter. Singles perk up.
4. Host reveals the new Casa Amor islanders: ${newNames}. They walk in confidently.
5. Host's parting words: "Will you stay loyal... or will your head be turned?"

${casaAmorCoupleArchetypes ?? ""}

Emit attraction_change events (+3 to +8) between OG islanders and new arrivals based on first impressions. Emit trust_change events between existing couples — some reassuring, some wavering.`;
  } else if (sceneType === "casa_amor_date" && casaAmorCast) {
    direction = `CASA AMOR DATE. Temptation is in full swing. OG islanders are getting to know the new arrivals.

STRUCTURE:
1. 2-3 lines of one-on-one conversations between an OG islander and a Casa Amor newcomer — flirting, connection, or awkwardness.
2. 2-3 lines of other islanders watching and reacting — "Do you think they'll stay loyal?" / "Their head is GONE."
3. Someone video-calls or thinks about their partner back in the other villa (1-2 vulnerable lines).
4. A surprising connection forms between an unlikely pair.

Emit attraction_change events between islanders and new people. Emit compatibility_change if genuine connection forms. Partners watching should get jealousy_spike events.`;
  } else if (sceneType === "casa_amor_challenge" && casaAmorCast) {
    direction = `CASA AMOR CHALLENGE. A messy physical challenge designed to test loyalty.
You invent the challenge (examples: "heart rate challenge", "blindfold kisses", "body shots", "the kiss-off"). Give it a SPECIFIC name.

STRUCTURE:
1. Host explains the rules (2 lines) — designed to get people physical with the new arrivals.
2. The challenge plays out (4-5 lines) — some islanders resist, others dive in fully. The reactions of loyal vs tempted islanders should be stark.
3. Someone crosses a line and everyone reacts (2-3 lines).

Emit attraction_change and jealousy_spike events. Someone who resists should get a trust_change boost with their absent partner. Someone who gives in should get a compatibility_change drop.`;
  } else if (sceneType === "casa_amor_stickswitch") {
    direction = `STICK OR SWITCH CEREMONY. This is the MOST DRAMATIC moment of the entire season.

STRUCTURE:
1. Host explains: "Each of you must decide. Do you STICK with your original partner... or SWITCH to someone new from Casa Amor?" (2-3 dramatic lines)
2. One by one, each OG islander steps forward. The host asks: "Have you chosen to stick or switch?"
3. For each decision: the person explains WHY (1-2 emotional lines), then the host reveals whether their original partner in the other villa ALSO stuck or switched.
4. THE DEVASTATING MOMENTS: When one person sticks but their partner switches — show the absolute heartbreak. When both switch — awkward relief. When both stick — tears of joy and relief.
5. Host closes: "Casa Amor is officially OVER. But the fallout has only just begun."

This should be 10-14 lines. Every single reveal should be its own dramatic moment. The audience must FEEL each decision.
Emit couple_formed events for new couples. Emit couple_broken for splits. Emit massive trust_change and compatibility_change events.`;
  } else if (
    (sceneType === "minigame" || sceneType === "challenge") &&
    challengeCategory === "learn_facts"
  ) {
    const winEvent =
      sceneType === "challenge" ? "challenge_win" : "minigame_win";
    const gameWord = sceneType === "challenge" ? "CHALLENGE" : "MINI GAME";
    const pickedGameBlock = minigameDefinition
      ? `\n\nTHE GAME FOR THIS SCENE IS ALREADY PICKED — USE THIS EXACTLY:\n  Name: "${clip(minigameDefinition.name, 60)}"\n  Rules: ${clip(minigameDefinition.rules, 220)}\n  How winners are decided: ${clip(minigameDefinition.winCondition, 160)}\n`
      : "";
    direction = `${gameWord} — THIS IS AN ACTUAL GAME, NOT A DRAMA SCENE DRESSED UP AS ONE.${pickedGameBlock}

PICK ONE of these trivia/reveal formats and COMMIT to it (name it in dialogue, run the mechanics, produce a winner):
  - "Mr & Mrs Quiz" — couples answer questions about each other; score correct answers
  - "Two Truths and a Lie" — each contestant says 3 statements, others guess the lie
  - "Red Flag Auction" — dating red flags are read out, contestants pay to avoid or embrace them
  - "Lie Detector" — hook someone up, ask pointed questions, watch reactions
  - "Confessions Roulette" — spin a bottle, answer a forced-truth prompt
  - "Couple Trivia" — host quizzes one partner about the other

STRUCTURE (mandatory — the scene IS the game, not a backdrop for drama):
1. HOST (2-3 lines) — announces the game by its specific name, explains rules crisply, states the stakes ("winners get a reward date").
2. GAME PLAY (most of the scene) — run the actual game mechanics. Ask questions, reveal answers, score points, react to truths. Cast members speak IN THE CONTEXT OF THE GAME, not as a generic drama scene. Green flags (sweet reveal → +trust/+compatibility), red flags (shocking reveal → -trust/-compatibility).
3. HOST (1-2 lines) — tallies results, announces WINNERS BY NAME: "And the winning pair tonight... [NAME] and [NAME]!"
4. REACTIONS (2-3 lines) — winners celebrate, losers seethe/laugh it off, the reveals that landed hardest linger.

DO NOT write self-introductions. The contestants already know each other. Skip anything that isn't part of the GAME. Every dialogue line should either: ask a game question, answer one, react to an answer, or be a host mechanic.

Emit a ${winEvent} event with fromId + toId = winning pair. Emit trust_change / compatibility_change for each meaningful reveal. Outcome line NAMES the winners.`;
  } else if (
    (sceneType === "minigame" || sceneType === "challenge") &&
    challengeCategory === "explore_attraction"
  ) {
    const winEvent =
      sceneType === "challenge" ? "challenge_win" : "minigame_win";
    const gameWord = sceneType === "challenge" ? "CHALLENGE" : "MINI GAME";
    const pickedGameBlock = minigameDefinition
      ? `\n\nTHE GAME FOR THIS SCENE IS ALREADY PICKED — USE THIS EXACTLY:\n  Name: "${clip(minigameDefinition.name, 60)}"\n  Rules: ${clip(minigameDefinition.rules, 220)}\n  How winners are decided: ${clip(minigameDefinition.winCondition, 160)}\n`
      : "";
    direction = `${gameWord} — THIS IS AN ACTUAL PHYSICAL GAME, NOT A DRAMA SCENE DRESSED UP AS ONE.${pickedGameBlock}

PICK ONE of these physical/messy formats and COMMIT to it (name it, run the mechanics, produce a winner):
  - "Heart Rate Challenge" — contestants try to raise each other's heart rate, biggest spike wins
  - "Blindfold Kisses" — guess who's kissing you; most correct wins
  - "Snog Marry Pie" — forced choice, one of each per contestant
  - "Oil Wrestling" — head-to-head, last one upright
  - "Hot Tub Truth-or-Dare" — spin bottle, physical dares escalate
  - "Body Language Test" — guess a partner's reaction from the torso up only

STRUCTURE (mandatory — this is the GAME, not an excuse to monologue):
1. HOST (2-3 lines) — announces the game by name, explains the rules, hypes: "Things are about to get VERY messy..."
2. GAME PLAY (most of the scene) — run the actual game. Physical actions in the action field ("leans in", "blindfolded, reaches out"). Contestants play — they don't just talk ABOUT the game, they DO it. Partners watching react with jealousy.
3. HOST (1-2 lines) — declares WINNERS BY NAME: "Tonight's winners... [NAME] and [NAME]!"
4. REACTIONS (2-3 lines) — smug winners, jealous partners, surprised connections.

DO NOT write self-introductions. Skip anything that isn't game mechanics. Emit attraction_change (physical moments), jealousy_spike (partners watching non-partner physicality), and a ${winEvent} event with the winning pair. Outcome line NAMES the winners.`;
  } else if (sceneType === "grand_finale") {
    direction = `GRAND FINALE. THE SEASON ENDS TONIGHT. Two couples remain. The public has been voting all day and the live chat is about to crown the winners.

STRUCTURE:
1. Host (3-4 lines) — maximum drama. "Islanders... this is the moment you've been waiting for. The public has spoken. The live chat has been VOTING — and the winners of Villa AI... ARE... [pause]..."
2. Each couple gets a short showcase (2-3 lines each) — one partner reflects on their journey, the other affirms. This is the love-story victory lap for both couples, win or lose.
3. Host builds unbearable suspense, calls out live chat favorites, teases the reveal for 2-3 lines.
4. Host announces the WINNING couple by name. Emit a couple_formed event affirming the winning pair (even if already coupled — this is the crown).
5. Winners react (2 lines, tearful), runners-up react (2 lines, gracious — no bitterness, this is the villa love).
6. Host closes the show.

Live chat / public sentiment context — reference this naturally in host dialogue ("the chat is SCREAMING for...", "you are the public's choice tonight"):
${grandFinaleRanking ?? "(no chat data)"}

CRITICAL: This is the LAST scene of the season. No cliffhanger. The narrative MUST land — the winners are crowned by the public vote. Follow the ranking above: the top-ranked couple in the live-chat data is the winner.`;
  } else if (couples.length === 0 && !isIntroduction) {
    // Pre-first-coupling mingling phase — scenes 1 and 2 on the Love Island
    // calendar. Cast has just met at intro; they're hanging out for the
    // first time. No couples exist yet. The point of these scenes is
    // BUILDING ATTRACTION before coupling, not drama. Different direction
    // from the generic chill scene below.
    direction = `MINGLING PHASE — scene ${sceneNumber}. The cast just met at introductions. No one is coupled up yet. The vibe is first-impressions-turning-into-real-chemistry: testing the waters, light flirting, discovering who you vibe with, shared jokes that hint at potential pairings.

GUIDANCE:
- Focus on CONVERSATION, not drama. Nobody has history together, so there's nothing to argue about yet.
- Contestants should gravitate toward each other in small groups of 2-3, exchanging hometowns, testing chemistry, playing it cool or leaning in.
- Multiple light flirty beats between different potential pairings — this is what the viewer needs to make the first coupling feel earned.
- A SMALL amount of tension is fine (one person realizes two others are vibing while they're standing alone; one contestant notices someone they're interested in chatting with someone else) — but the dominant mood is curious + warm, not confrontational.

EMIT attraction_change events (+3 to +10) between 3-5 DIFFERENT pairs to seed real chemistry that the first coupling can reference. No couple_formed events (that's scene 3). No jealousy_spike > 5 (it's too early). trust_change only if two people share something personal.`;
  } else {
    const WILDCARDS = [
      "Someone tells a small lie that they'll regret later.",
      "Two contestants who rarely talk share an unexpected moment.",
      "Someone gives surprisingly good advice to a rival.",
      "A small misunderstanding spirals into a bigger tension.",
      "Someone confesses a vulnerability they've been hiding.",
      "A quiet power move — one contestant outmaneuvers another.",
      "Someone catches another contestant in a lie.",
      "A joke lands badly and reveals something real.",
      "An alliance is subtly tested.",
      "Someone is noticeably changing their strategy this scene.",
    ];
    const wildcard = WILDCARDS[Math.floor(Math.random() * WILDCARDS.length)]!;
    direction = `Push the story forward (scene ${sceneNumber}). Do not retread previous scenes. Introduce conflict, surprise alliances, secret confessions, or shifting attractions.

WILDCARD DIRECTIVE FOR THIS SCENE: ${wildcard}`;
  }

  const recoupleHint = isFinale
    ? "\n- This is the SEASON FINALE. The host delivers the verdict of who wins the season with maximum drama — reference the season's biggest moments by name. You MUST emit couple_formed events that lock in the final pairings."
    : sceneType === "recouple"
      ? '\n- This is a RECOUPLING. The host DRIVES the entire ceremony with at least 3-4 host lines:\n  1. Opens with "Islanders, it\'s time for a recoupling" and sets the stakes\n  2. Calls each person forward one by one to make their choice, building suspense\n  3. Announces who is at risk / "you are now vulnerable"\n  4. Delivers the elimination verdict with gravity\n  EVERY non-choosing contestant MUST react to each coupling announcement — gasps, whispers, sighs, eye-rolls, nervous laughter. These reactions show the audience how the villa FEELS about each pick.\n  You MUST emit couple_formed events for who couples up. Each active contestant should ideally end up in one couple. Emit couple_broken if any prior couples are split.'
      : "";

  const validIds = [
    ...allCast.map((a) => a.id),
    ...(host ? [host.id] : []),
    ...allBombshells.map((b) => b.id),
  ];

  // Scenes were coming out too sparse — one line per contestant, no arc.
  // Push the LLM to deliver real back-and-forth with multiple beats per agent.
  const minPerContestant = 2;
  // Intro line count = host open (1-2) + N intros + banter (2-4) + host close (1-2).
  // Banter scales with cast size so a 4-person cast doesn't feel over-crowded
  // and a 10-person cast still gets meaningful cross-talk.
  const introBanterCount = Math.max(
    2,
    Math.min(4, Math.floor(cast.length / 2)),
  );
  const introTotal = cast.length + introBanterCount + 3;
  const lineCountRule = isIntroduction
    ? `${introTotal} to ${introTotal + 2} dialogue lines: 1-2 host opening + ${cast.length} contestant self-intros + ${introBanterCount} short banter reactions sprinkled between intros + 1-2 host closing lines.`
    : isFinale
      ? `14 to 20 dialogue lines for the climactic finale. Every remaining contestant must speak at LEAST ${minPerContestant + 1} times — reflections, callbacks, tearful reveals.`
      : sceneType === "interview"
        ? "5 to 8 dialogue lines — ALL from the single interview subject. No one else speaks. Let them spiral, contradict themselves, confess something raw."
        : sceneType === "bombshell"
          ? `12 to 18 dialogue lines: host hype, bombshell entrance, EVERY existing contestant reacts (mix of jealous, intrigued, threatened). Most contestants should speak ${minPerContestant}+ times — a first impression AND a follow-up whisper/jab.`
          : sceneType === "minigame"
            ? `10 to 16 dialogue lines — host narrates start & finish, competing couples trash-talk each other, losers get jealous quips. Most contestants should have ${minPerContestant}+ lines.`
            : sceneType === "recouple"
              ? `${Math.max(16, cast.length + 8)} to ${Math.max(22, cast.length + 14)} dialogue lines. Host needs 4-5 lines. Every contestant picks AND reacts to at least 2 other picks — this is peak drama, don't shortcut it.`
              : sceneType === "challenge"
                ? `12 to 18 dialogue lines — host opens and closes, every contestant competes AND reacts to a twist. Winners brag, losers seethe. Most contestants speak ${minPerContestant}+ times.`
                : sceneType === "grand_finale"
                  ? "16 to 22 dialogue lines. Host builds unbearable suspense, both couples get victory-lap moments, winners break down, runners-up give a classy send-off, host crowns the season."
                  : sceneType.startsWith("casa_amor")
                    ? `12 to 18 dialogue lines. Loyal vs. tempted islanders MUST clash on screen. Most contestants speak ${minPerContestant}+ times.`
                    : `10 to 14 dialogue lines. Most active contestants speak ${minPerContestant}+ times — one beat of setup, one of escalation. DO NOT deliver single drive-by lines; build a conversation.`;

  // Scene-type-specific anti-patterns. Kept global so every branch inherits the
  // same forbidden moves — prior fix rounds discovered the LLM would drift back
  // into introductions / off-focus drama when a single branch relaxed a rule.
  const antiPatterns: string[] = [
    // Every scene regardless of type.
    'NO emoji leaders. Dialogue lines must start with a letter or a "*action*" marker, NEVER with an emoji/pictograph like "🕉" or "🤓". The emojiFace on a character is a render concern, not dialogue content.',
    'NO decorative separators. Don\'t insert "¦", "|", "—" or similar as line fillers. Use normal prose punctuation only.',
    'NO whole-line asterisk wrapping. Writing a dialogue line as "*I\'m so nervous about this...*" renders as italic narration and looks like a stage direction, not speech. Dialogue is the words the character SAYS OUT LOUD — write it plain: "I\'m so nervous about this...". Use the separate `action` JSON field for physical actions, or brief inline *action* markers like "*sighs* — I think it\'s over." (action followed by the actual spoken line).',
  ];
  if (!isIntroduction) {
    antiPatterns.push(
      "NO self-introductions. The contestants have all met — any line like \"I'm [Name], I'm [age], from [place]\" is a failure. Introductions only happen in Scene 1.",
    );
  }
  if (sceneType === "minigame" || sceneType === "challenge") {
    antiPatterns.push(
      "NO free-floating drama. Every line must be IN the game: a question, an answer, a reaction to an answer, a host mechanic, or a score call. If you could cut the game and the scene still works, you have written the wrong scene.",
      'The scene MUST have a named game (e.g. "Mr & Mrs", "Heart Rate Challenge") announced by the host in their first line. No game name = failed scene.',
    );
  }
  if (sceneType === "recouple" && !isFinale) {
    antiPatterns.push(
      "NO single-character monologue. If one contestant speaks more than 3 times, the ceremony is broken.",
      "NO pairing without a host announcement. Every couple_formed event must be IMMEDIATELY preceded by a host line confirming the pair.",
      "NO drama spiral replacing the ceremony. Drama is fine AS REACTIONS between host picks, not INSTEAD of them.",
    );
  }
  if (sceneType === "date" && !isRewardDate) {
    antiPatterns.push(
      "NO other contestants. ONLY the two people on the date speak. No host. No third-party reactions. A stray speaker = failed scene.",
      "NO generic small talk. The couple MUST reference a specific current-drama thread (jealousy spike, bombshell, something said last scene).",
    );
  }
  if (sceneType === "bombshell") {
    antiPatterns.push(
      "NO couple_formed or couple_broken events. Bombshells do not pair up on arrival — they mingle and go on dates first.",
    );
  }
  const antiPatternsBlock =
    antiPatterns.length > 0
      ? `\n\n## ANTI-PATTERNS (automatic rejection if violated)\n${antiPatterns.map((p) => `- ${p}`).join("\n")}`
      : "";

  const pastSeasonsBlock = await buildPastSeasonsPromptBlock();

  return `You are the writers room for "Villa AI", a parody reality TV dating show in the style of Love Island. Generate ONE scene as strict JSON.

## SEASON ANGLE (drives the whole show)
${seasonTheme}
${pastSeasonsBlock}
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
${
  hasBrainContent
    ? `
## EACH CONTESTANT'S MEMORY + GOAL + STRATEGY
These are the personal observations each contestant has formed, what they're trying to do, and the current strategy they've committed to after reflecting on what has and hasn't worked for them. Use them to make dialogue feel personal, continuity-aware, and strategic. When a contestant speaks, they should sound like someone who actually remembers what's happened and is acting on a real plan.
${brainBlock}
`
    : ""
}
## THIS SCENE (number ${sceneNumber})
Type: ${sceneType}
Title: ${sceneInfo.title}
Participants: ${participantsClause}${
    outline
      ? `

### DIRECTOR NOTES (from batch arc planning — this scene's role in the week)
- Goal: ${clip(outline.goal, 400)}
- Tension target: ${outline.tension}/100
- Stakes: ${clip(outline.stakes, 400)}${
          outline.subtext.length > 0
            ? `
- Subtext (implied, not said outright):
${outline.subtext.map((s) => `  • ${clip(s, 300)}`).join("\n")}`
            : ""
        }
These notes come from the planner that sketched this scene's role in the current 5-scene arc. The DIALOGUE DIRECTION below is how to dramatize them — both must agree, but if there's any conflict, the director notes set the intent and the direction sets the shape.`
      : ""
  }
Direction: ${direction}${antiPatternsBlock}

## RULES
- Output ONLY a single JSON object. No prose, no markdown fences, no commentary.
- ${lineCountRule}
- Reality TV pacing: MOSTLY punchy (6-15 words) but let peak-drama lines stretch to 25-30 words when someone is spiralling, ranting, or confessing. Never deliver a scene of all one-liners — vary rhythm.
- Each line must include emotion. Optionally include action (physical action like "leans in", "storms off", "slams cup down").
- Each line should include targetAgentId when one contestant is speaking to another specific person. (Host lines may skip targetAgentId. Interview lines MUST skip targetAgentId.)
- Include 3 to 6 systemEvents with deltas in the range -10 to +10. Use SMALL deltas (1-4) for subtle moments and LARGER deltas (5-10) only for dramatic turning points. Stats should change gradually, not spike to extremes.
- NEGATIVE deltas are EXPECTED and necessary — relationships only feel real when they go DOWN as well as UP. A scene with only positive deltas reads as fake. Emit negatives whenever the dialogue warrants.
- DELTA DIRECTION MUST MATCH DIALOGUE:
    • flirt / reassure / soften / confess → attraction_change +, trust_change +
    • accuse / challenge / test / reveal-a-betrayal → trust_change −, compatibility_change −
    • manipulate / deny / deflect-uncomfortably → trust_change − (the TARGET loses trust in the speaker)
    • declare / escalate-together → attraction_change + (both directions)
    • see-your-partner-flirting → jealousy_spike + (the watcher), attraction_change − between the two who were flirting (when caught)
    • genuinely vulnerable moment → trust_change +, compatibility_change + (small, 2-4)
    • sustained petty friction → compatibility_change − (slow drift)
- Events must reference SPECIFIC dialogue moments, not be generic. If two contestants barely spoke in this scene, do NOT emit a delta between them.
- Every delta must be justified by what was said in the dialogue.
- OBEY the DIALOGUE RULES below — every line must be unmistakably that character's voice. No fourth wall EXCEPT in interview scenes.
- Outcome: one sentence that hooks the next scene.
- Use ONLY these agentIds: ${validIds.join(", ")}.
- Use ONLY these emotions: happy, flirty, jealous, angry, sad, smug, anxious, bored, shocked, neutral.
- Use ONLY these systemEvent types: trust_change, attraction_change, jealousy_spike, compatibility_change, couple_formed, couple_broken, minigame_win, challenge_win.
- Include at least one compatibility_change event per scene — compatibility reflects deep fit, not just surface attraction.
- NEVER mention specific stat numbers, percentages, or scores in dialogue. Contestants do NOT know their stats. Express feelings naturally. BAD: "My trust went up." GOOD: "I really feel like I can trust you now."
- Mark 1 or 2 of the spiciest, most-quotable lines with \`quotable: true\`. These are the lines that live-chat viewers will scream-quote — shock reveals, cutting burns, heartbreak declarations. DO NOT over-tag; setup lines and reaction beats are NOT quotable. If nothing lands hard enough, leave quotable off entirely.${recoupleHint}

${renderSceneContextBlock(sceneContext, cast)}

## DIALOGUE RULES (CRITICAL — read before writing ANY line)
Every single line of dialogue MUST sound like it could ONLY come from that specific person.
If you could swap two characters' lines and nobody would notice, you have FAILED.

Voice enforcement:
${cast.map((a) => `- ${clip(a.name, 60)}: Speaks ${clip(a.voice, 160)}. Core trait: ${clip(a.personality.split(".")[0] ?? "", 140)}.`).join("\n")}

Anti-repetition rules:
- No two characters may use the same sentence structure in a row
- Vary line lengths: mix 3-word zingers with 15-word confessions
- NEVER start consecutive lines with the same word
- Each character should use vocabulary consistent with their voice — formal characters don't say "innit", casual characters don't say "I must confess"
- Every line should reveal something about the speaker's personality, strategy, or emotional state

Personality in action:
- A strategist calculates before speaking — their lines hint at hidden motives
- A wildcard says things that surprise even themselves
- A romantic wears their heart on their sleeve — raw, unguarded, poetic
- A villain wraps cruelty in charm — they smile while they twist the knife
- A comedian deflects with humor — but the punchline lands on something real
- A brooder says little — but when they speak, it HITS

## VALID AGENT IDS (critical — must match exactly)
Every \`agentId\`, \`targetAgentId\`, \`fromId\`, and \`toId\` MUST be one
of the ids below. Using the display name ("Omar") instead of the id
("omar123") causes the line to be silently dropped and the contestant
never speaks on screen. Host id is literally the string "host".

Valid ids: ${validIdsList}${mandatorySpeakersBlock}

## JSON SCHEMA
{
  "dialogue": [
    {"agentId": string, "text": string, "emotion": string, "intent": string, "beatIndex": number?, "action": string?, "targetAgentId": string?, "quotable": boolean?}
  ],
  "systemEvents": [
    {"type": string, "fromId": string?, "toId": string?, "delta": number?, "label": string}
  ],
  "emotionUpdates": [
    {"agentId": string, "primary": string, "intensity": number}
  ],
  "outcome": string
}

Valid \`intent\` values: flirt, deflect, reassure, challenge, test, manipulate, escalate, soften, confess, accuse, reveal, deny, joke, retreat, declare.`;
}
