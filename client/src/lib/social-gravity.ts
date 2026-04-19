import type {
  Agent,
  Relationship,
  Scene,
  SystemEvent,
  ViewerMessage,
} from "@villa-ai/shared";
import {
  POPULARITY_FAVORITE_THRESHOLD,
  POPULARITY_TARGET_THRESHOLD,
  POPULARITY_UP_THRESHOLD,
  POPULARITY_DOWN_THRESHOLD,
} from "@villa-ai/shared";

export const FAVORITE_THRESHOLD = POPULARITY_FAVORITE_THRESHOLD;
export const TARGET_THRESHOLD = POPULARITY_TARGET_THRESHOLD;
export const UP_THRESHOLD = POPULARITY_UP_THRESHOLD;
export const DOWN_THRESHOLD = POPULARITY_DOWN_THRESHOLD;

const DRIP_TRUST = 0.5;
const DRIP_ATTRACTION = 0.3;
const DRIP_NEGATIVE_TRUST = 0.5;

const SATURATION_CAP = 10;

const THRESHOLD_DELTA_UP = 2;
const THRESHOLD_DELTA_DOWN = 2;

const DEFAULT_SENTIMENT = 50;

const POSITIVE_DELTA = 0.8;
const NEGATIVE_DELTA = 0.8;
const CHAOTIC_VILLAIN_DELTA = 0.5;
const CHAOTIC_FLIRTY_DELTA = 0.3;
const NEUTRAL_DELTA = 0.1;

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

const FLIRTY_CUES = [
  "chemistry",
  "love is in the air",
  "main character",
  "giggling",
  "kicking their feet",
  "couple goals",
  "are everything",
];

export function pairKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

export function aggregateChatToPopularity(
  messages: readonly ViewerMessage[],
  scene: Scene,
  prev: Record<string, number>,
  activeCast: readonly Agent[],
): Record<string, number> {
  const next: Record<string, number> = { ...prev };
  if (messages.length === 0) return next;

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

  const activeIds = new Set(activeCast.map((a) => a.id));
  for (const id of Object.keys(next)) {
    if (!activeIds.has(id)) {
    }
  }

  return next;
}

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
      return 0;    }
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

  const activeIds = activeCast.map((a) => a.id);
  const relationshipSet = new Set(
    relationships.map((r) => pairKey(r.fromId, r.toId)),
  );

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
        id: crypto.randomUUID(),
        type: "gravity_threshold",
        fromId: agent.id, // self-referential; label carries the meaning
        toId: agent.id,
        delta: 0,
        label: `${agent.name} locks in as a viewer favorite — the group starts orbiting them`,
        metric: "trust",
      });
      for (const otherId of activeIds) {
        if (otherId === agent.id) continue;
        if (!relationshipSet.has(pairKey(otherId, agent.id))) continue;
        events.push({
          id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
          id: crypto.randomUUID(),
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
        );
        pushDrip(
          events,
          nextCumulative,
          otherId,
          agent.id,
          DRIP_ATTRACTION,
          "attraction",
          `warming to ${agent.name}`,
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

function pushDrip(
  events: SystemEvent[],
  cumulative: Map<string, number>,
  fromId: string,
  toId: string,
  baseDelta: number,
  metric: Extract<"trust" | "attraction", "trust" | "attraction">,
  label: string,
) {
  const key = `${pairKey(fromId, toId)}|${metric}`;
  const prior = cumulative.get(key) ?? 0;
  const effective = prior >= SATURATION_CAP ? baseDelta * 0.5 : baseDelta;
  events.push({
    id: crypto.randomUUID(),
    type: "gravity_shift",
    fromId,
    toId,
    delta: effective,
    label,
    metric,
  });
  cumulative.set(key, prior + Math.abs(effective));
}

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
