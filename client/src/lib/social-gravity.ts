// Social gravity engine: closes the scenes ↔ chat ↔ popularity ↔ relationships
// loop.
//
//   scene committed
//     → generateViewerReactions produces ViewerMessage[]
//     → aggregateChatToPopularity folds chat sentiment into viewerSentiment
//     → applySocialGravity emits gravity_shift + gravity_threshold events
//     → applyEventList applies gravity deltas to relationships
//     → next prompt reads popularityBlock for LLM context
//
// The three exports are pure — no store access, no React, no side effects.
// Consumers pass the prior state in and receive new state out, which keeps the
// reducer testable in isolation and future-proofs the architecture for when
// the USERNAMES template pool is replaced with RL-trained viewer-persona
// policies (see design doc "Open Direction"): the aggregator treats
// ViewerMessage[] as opaque, so swapping the generator changes no downstream
// code.

import type {
  Agent,
  Relationship,
  Scene,
  SystemEvent,
  ViewerMessage,
} from "@villa-ai/shared";

// Popularity band thresholds. Sentiment ≥ FAVORITE_THRESHOLD pulls other cast
// members toward the agent (+trust, +attraction); ≤ TARGET_THRESHOLD pushes
// them away (-trust). The dead band in the middle keeps the loop quiet when
// viewers have no strong feelings yet.
export const FAVORITE_THRESHOLD = 70;
export const TARGET_THRESHOLD = 30;

// Threshold crossings fire the big named narrative beats. Tighter than the
// drip bands so the beat only lands when sentiment really locks in (>= 80 or
// <= 20), not the moment someone hits 71.
export const UP_THRESHOLD = 80;
export const DOWN_THRESHOLD = 20;

// Per-scene drip magnitudes. Small enough to be a rounding-error nudge that
// only matters over 5–10 scenes of consistent sentiment — so popularity never
// out-muscles LLM-emitted scene deltas (which are ±3–10 per event).
const DRIP_TRUST = 0.5;
const DRIP_ATTRACTION = 0.3;
const DRIP_NEGATIVE_TRUST = 0.5;

// Once a pair's cumulative absolute gravity exceeds SATURATION_CAP, further
// drips halve. Prevents runaway singularities where one agent becomes a
// god-favorite and the whole matrix tips toward them.
const SATURATION_CAP = 10;

// Named threshold events — bigger delta, visible in the scene feed, only
// fires once per direction per agent per season.
const THRESHOLD_DELTA_UP = 2;
const THRESHOLD_DELTA_DOWN = 2;

// Default sentiment for agents with no prior data. Agents who arrive as
// bombshells haven't appeared in chat yet, so they start neutral.
const DEFAULT_SENTIMENT = 50;

// Chat sentiment → popularity-delta map. Chaotic is split because in a
// Love Island simulator chaotic-chat-about-a-villain is a negative signal
// ("watching a trainwreck"), while chaotic-chat-about-a-flirty-moment is
// positive. Any other chaotic fires as neutral spectacle so the aggregator
// doesn't over-reward generic drama.
const POSITIVE_DELTA = 0.8;
const NEGATIVE_DELTA = 0.8;
const CHAOTIC_VILLAIN_DELTA = 0.5;
const CHAOTIC_FLIRTY_DELTA = 0.3;
const NEUTRAL_DELTA = 0.1;

// Cues a chat message carries a villain/trainwreck signal. Matching these
// flips chaotic sentiment to a popularity drop rather than a lift. Drawn from
// the emotion-cluster templates in viewerChat.ts — angry/jealousy-cluster
// reactions use words like "fuming", "exposed", "went off".
const VILLAIN_CUES = [
  "fuming",
  "exposed",
  "went off",
  "side eye",
  "villain",
  "jealous",
  "fumbling",
  "trainwreck",
  "ganging up",
  "open season",
  "can not catch a break",
  "never loyal",
];

// Cues a chaotic message is actually celebrating something (flirty, couple
// energy). If neither set matches, the chaotic message contributes zero —
// default behavior is conservative.
const FLIRTY_CUES = [
  "chemistry",
  "love is in the air",
  "main character",
  "giggling",
  "kicking their feet",
  "couple goals",
  "are everything",
];

// A stable key for a (from, to) ordered pair. Used by the caller to look up
// cumulative gravity for saturation decay. Exposed so tests can construct
// the same key the engine uses.
export function pairKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

// Returns a new sentiment map with chat-derived deltas applied. Missing
// agents initialize to DEFAULT_SENTIMENT (prevents NaN when a bombshell is
// @mentioned in chat on their arrival scene). Eliminated agents are filtered
// out so their sentiment doesn't keep drifting post-exit.
export function aggregateChatToPopularity(
  messages: readonly ViewerMessage[],
  scene: Scene,
  prev: Record<string, number>,
  activeCast: readonly Agent[],
): Record<string, number> {
  const next: Record<string, number> = { ...prev };
  if (messages.length === 0) return next;

  // Build a name → id lookup for token-matching message text. Scene
  // participants take precedence (more likely to be the referent when a
  // common nickname appears in multiple agents), then the rest of active
  // cast for the long tail.
  const participantSet = new Set(scene.participantIds);
  const sortedCast = [...activeCast].sort((a, b) => {
    const aIn = participantSet.has(a.id) ? 0 : 1;
    const bIn = participantSet.has(b.id) ? 0 : 1;
    return aIn - bIn;
  });

  for (const message of messages) {
    const textLower = message.text.toLowerCase();
    const mentionedIds = new Set<string>();
    for (const agent of sortedCast) {
      const nameLower = agent.name.toLowerCase();
      if (nameLower.length < 2) continue;
      // Require a word-boundary match so "Mia" doesn't also fire on "remain".
      // Loose regex — just word boundaries around the lowercased name.
      const pattern = new RegExp(
        `\\b${nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      );
      if (pattern.test(textLower)) mentionedIds.add(agent.id);
    }
    if (mentionedIds.size === 0) continue;

    const delta = deltaForMessage(message, textLower);
    if (delta === 0) continue;

    for (const id of mentionedIds) {
      const current = next[id];
      const base =
        typeof current === "number" && Number.isFinite(current)
          ? current
          : DEFAULT_SENTIMENT;
      const updated = clampSentiment(base + delta);
      next[id] = Number.isFinite(updated) ? updated : DEFAULT_SENTIMENT;
    }
  }

  // Drop sentiment for eliminated agents — once they exit the villa, their
  // popularity is frozen at their exit value (caller's choice whether to
  // preserve or wipe it, but we don't keep drifting).
  const activeIds = new Set(activeCast.map((a) => a.id));
  for (const id of Object.keys(next)) {
    if (!activeIds.has(id)) {
      // Don't delete — training export may still want the final value.
      // Just stop mutating it here by leaving it untouched at its prior
      // state. The ... spread at the top already copied it.
    }
  }

  return next;
}

// Decides the popularity delta for one ViewerMessage. Split out so the
// chaotic-sentiment sign fix (chaotic = villain = drop) is unit-testable
// directly without going through the aggregator.
function deltaForMessage(message: ViewerMessage, textLower: string): number {
  switch (message.sentiment) {
    case "positive":
      return POSITIVE_DELTA;
    case "negative":
      return -NEGATIVE_DELTA;
    case "chaotic": {
      const hasVillain = VILLAIN_CUES.some((c) => textLower.includes(c));
      if (hasVillain) return -CHAOTIC_VILLAIN_DELTA;
      const hasFlirty = FLIRTY_CUES.some((c) => textLower.includes(c));
      if (hasFlirty) return CHAOTIC_FLIRTY_DELTA;
      return 0; // neutral spectacle — bystander not tipping the scale
    }
    case "neutral":
      return NEUTRAL_DELTA;
    default:
      return 0;
  }
}

function clampSentiment(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export interface GravityPassResult {
  events: SystemEvent[];
  nextCumulative: Map<string, number>;
  crossedThresholds: string[];
}

// Emits the per-scene gravity events from the current sentiment + relationship
// state. Returns a fresh SystemEvent[] plus an updated cumulative tracker
// (for saturation decay) and any new threshold-crossing markers the caller
// should append to episode.crossedThresholds.
export function applySocialGravity(
  sentiment: Record<string, number>,
  relationships: readonly Relationship[],
  activeCast: readonly Agent[],
  seasonCumulative: ReadonlyMap<string, number>,
  prevSentiment: Record<string, number>,
  crossedThresholds: readonly string[],
): GravityPassResult {
  const events: SystemEvent[] = [];
  const nextCumulative = new Map(seasonCumulative);
  const newCrossings: string[] = [];
  const crossedSet = new Set(crossedThresholds);
  let eventCounter = 0;

  const activeIds = activeCast.map((a) => a.id);
  const relationshipSet = new Set(
    relationships.map((r) => pairKey(r.fromId, r.toId)),
  );

  // Threshold events — fire when sentiment CROSSES 80 (up) or 20 (down) for
  // the first time this season, per agent per direction.
  for (const agent of activeCast) {
    const cur = sentiment[agent.id];
    const prev = prevSentiment[agent.id];
    if (typeof cur !== "number" || !Number.isFinite(cur)) continue;
    const prevVal =
      typeof prev === "number" && Number.isFinite(prev)
        ? prev
        : DEFAULT_SENTIMENT;

    const upKey = `${agent.id}:up`;
    const downKey = `${agent.id}:down`;

    if (
      cur >= UP_THRESHOLD &&
      prevVal < UP_THRESHOLD &&
      !crossedSet.has(upKey)
    ) {
      events.push({
        id: `grav_th_${Date.now()}_${eventCounter++}`,
        type: "gravity_threshold",
        fromId: agent.id, // self-referential; label carries the meaning
        toId: agent.id,
        delta: 0,
        label: `${agent.name} locks in as a viewer favorite — the group starts orbiting them`,
        metric: "trust",
      });
      // Broadcast +THRESHOLD_DELTA_UP trust from every other active agent
      // toward the favorite. This is the dramatic magnification of the drip.
      for (const otherId of activeIds) {
        if (otherId === agent.id) continue;
        if (!relationshipSet.has(pairKey(otherId, agent.id))) continue;
        events.push({
          id: `grav_th_${Date.now()}_${eventCounter++}`,
          type: "gravity_threshold",
          fromId: otherId,
          toId: agent.id,
          delta: THRESHOLD_DELTA_UP,
          label: `pulled toward ${agent.name} by viewer heat`,
          metric: "trust",
        });
      }
      newCrossings.push(upKey);
      crossedSet.add(upKey);
    }

    if (
      cur <= DOWN_THRESHOLD &&
      prevVal > DOWN_THRESHOLD &&
      !crossedSet.has(downKey)
    ) {
      events.push({
        id: `grav_th_${Date.now()}_${eventCounter++}`,
        type: "gravity_threshold",
        fromId: agent.id,
        toId: agent.id,
        delta: 0,
        label: `${agent.name} gets iced out — viewers have turned`,
        metric: "trust",
      });
      for (const otherId of activeIds) {
        if (otherId === agent.id) continue;
        if (!relationshipSet.has(pairKey(otherId, agent.id))) continue;
        events.push({
          id: `grav_th_${Date.now()}_${eventCounter++}`,
          type: "gravity_threshold",
          fromId: otherId,
          toId: agent.id,
          delta: -THRESHOLD_DELTA_DOWN,
          label: `distancing from ${agent.name} after viewer backlash`,
          metric: "trust",
        });
      }
      newCrossings.push(downKey);
      crossedSet.add(downKey);
    }
  }

  // Drip events — quiet continuous pull toward favorites and away from
  // targets. These fire every scene sentiment is outside the dead band,
  // not just on crossings.
  for (const agent of activeCast) {
    const cur = sentiment[agent.id];
    if (typeof cur !== "number" || !Number.isFinite(cur)) continue;

    if (cur >= FAVORITE_THRESHOLD) {
      for (const otherId of activeIds) {
        if (otherId === agent.id) continue;
        if (!relationshipSet.has(pairKey(otherId, agent.id))) continue;
        pushDrip(
          events,
          nextCumulative,
          otherId,
          agent.id,
          DRIP_TRUST,
          "trust",
          `drawn toward ${agent.name}`,
          () => eventCounter++,
        );
        pushDrip(
          events,
          nextCumulative,
          otherId,
          agent.id,
          DRIP_ATTRACTION,
          "attraction",
          `warming to ${agent.name}`,
          () => eventCounter++,
        );
      }
    } else if (cur <= TARGET_THRESHOLD) {
      for (const otherId of activeIds) {
        if (otherId === agent.id) continue;
        if (!relationshipSet.has(pairKey(otherId, agent.id))) continue;
        pushDrip(
          events,
          nextCumulative,
          otherId,
          agent.id,
          -DRIP_NEGATIVE_TRUST,
          "trust",
          `cooling on ${agent.name}`,
          () => eventCounter++,
        );
      }
    }
  }

  return {
    events,
    nextCumulative,
    crossedThresholds: newCrossings,
  };
}

// Pushes one drip event, applying saturation decay when the pair's cumulative
// absolute delta has exceeded SATURATION_CAP. Decayed magnitude is 50% — just
// enough to preserve directionality without letting gravity compound forever.
function pushDrip(
  events: SystemEvent[],
  cumulative: Map<string, number>,
  fromId: string,
  toId: string,
  baseDelta: number,
  metric: Extract<"trust" | "attraction", "trust" | "attraction">,
  label: string,
  tick: () => number,
) {
  const key = `${pairKey(fromId, toId)}|${metric}`;
  const prior = cumulative.get(key) ?? 0;
  const effective =
    Math.abs(prior) >= SATURATION_CAP ? baseDelta * 0.5 : baseDelta;
  events.push({
    id: `grav_drip_${Date.now()}_${tick()}`,
    type: "gravity_shift",
    fromId,
    toId,
    delta: effective,
    label,
    metric,
  });
  cumulative.set(key, prior + effective);
}

// Builds the popularity-intel block injected into the next scene's LLM
// prompt. Returns null when no agent is outside the dead band — no reason
// to spend prompt tokens on "everyone feels average."
export function buildPopularityBlock(
  sentiment: Record<string, number>,
  cast: readonly Agent[],
): string | null {
  const favorites: string[] = [];
  const targets: string[] = [];
  for (const agent of cast) {
    const value = sentiment[agent.id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value >= FAVORITE_THRESHOLD) {
      favorites.push(`${agent.name} ${Math.round(value)}`);
    } else if (value <= TARGET_THRESHOLD) {
      targets.push(`${agent.name} ${Math.round(value)}`);
    }
  }
  if (favorites.length === 0 && targets.length === 0) return null;

  const lines = ["## VIEWER VIBES (from live chat, 0-100)"];
  if (favorites.length > 0) lines.push(`favorites: ${favorites.join(", ")}`);
  if (targets.length > 0) lines.push(`targets: ${targets.join(", ")}`);
  return lines.join("\n");
}
