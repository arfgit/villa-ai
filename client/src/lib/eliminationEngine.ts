import type { Agent, Relationship, Couple } from "@villa-ai/shared";

export type EliminationType =
  | "recouple_dump"
  | "public_vote"
  | "islander_vote"
  | "producer_intervention";

export interface EliminationResult {
  eliminatedIds: string[];
  type: EliminationType;
  narrative: string;

  reason?: string;
}

function popularity(
  agentId: string,
  activeIds: string[],
  relationships: Relationship[],
): number {
  let total = 0;
  let count = 0;
  for (const r of relationships) {
    if (r.toId === agentId && activeIds.includes(r.fromId)) {
      total += (r.trust + r.attraction) / 2;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

function coupleStrength(couple: Couple, relationships: Relationship[]): number {
  const ab = relationships.find(
    (r) => r.fromId === couple.a && r.toId === couple.b,
  );
  const ba = relationships.find(
    (r) => r.fromId === couple.b && r.toId === couple.a,
  );
  return (
    (ab?.attraction ?? 0) +
    (ba?.attraction ?? 0) +
    (ab?.compatibility ?? 0) +
    (ba?.compatibility ?? 0)
  );
}

export function recoupleElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[],
): EliminationResult {
  if (active.length % 2 === 0)
    return { eliminatedIds: [], type: "recouple_dump", narrative: "" };

  const pairedIds = new Set<string>();
  for (const c of couples) {
    pairedIds.add(c.a);
    pairedIds.add(c.b);
  }
  const unpaired = active.filter((a) => !pairedIds.has(a.id));
  if (unpaired.length === 0)
    return { eliminatedIds: [], type: "recouple_dump", narrative: "" };

  let lowestId = unpaired[0]!.id;
  let lowestName = unpaired[0]!.name;
  let lowestScore = Infinity;
  for (const agent of unpaired) {
    const score = relationships
      .filter((r) => r.fromId === agent.id || r.toId === agent.id)
      .reduce((sum, r) => sum + r.attraction + r.compatibility, 0);
    if (score < lowestScore) {
      lowestScore = score;
      lowestId = agent.id;
      lowestName = agent.name;
    }
  }

  return {
    eliminatedIds: [lowestId],
    type: "recouple_dump",
    narrative: `${lowestName} was left single after the recoupling and has been dumped from the villa.`,
  };
}

export function publicVoteElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[],
  viewerSentiment?: Record<string, number>,
): EliminationResult {
  const activeIds = active.map((a) => a.id);

  function blendedPop(agentId: string): number {
    const relPop = popularity(agentId, activeIds, relationships);
    const viewerPop = viewerSentiment?.[agentId] ?? 50;
    return viewerSentiment ? relPop * 0.4 + viewerPop * 0.6 : relPop;
  }

  if (couples.length > 0) {
    const ranked = [...couples].sort(
      (a, b) =>
        coupleStrength(a, relationships) - coupleStrength(b, relationships),
    );
    const weakest = ranked[0]!;
    const popA = blendedPop(weakest.a);
    const popB = blendedPop(weakest.b);
    const dumpedId = popA < popB ? weakest.a : weakest.b;
    const dumpedName = active.find((a) => a.id === dumpedId)?.name ?? dumpedId;
    const partnerName =
      active.find((a) => a.id === (popA < popB ? weakest.b : weakest.a))
        ?.name ?? "";
    const viewerPop = viewerSentiment?.[dumpedId] ?? 50;
    const popText =
      viewerPop < 35
        ? "lacked fan support"
        : viewerPop < 55
          ? "couldn't rally enough viewer votes"
          : "was the weaker half of a fading couple";
    const reason = `The public dumped ${dumpedName} — they ${popText}${partnerName ? ` and their coupling with ${partnerName} had lost its spark` : ""}.`;
    return {
      eliminatedIds: [dumpedId],
      type: "public_vote",
      reason,
      narrative: `The public has spoken! ${dumpedName} received the fewest votes and has been dumped from the island.`,
    };
  }

  let lowestId = active[0]!.id;
  let lowestPop = Infinity;
  for (const agent of active) {
    const pop = blendedPop(agent.id);
    if (pop < lowestPop) {
      lowestPop = pop;
      lowestId = agent.id;
    }
  }
  const name = active.find((a) => a.id === lowestId)?.name ?? lowestId;
  const viewerPop = viewerSentiment?.[lowestId] ?? 50;
  const reason =
    viewerPop < 40
      ? `${name} had the lowest viewer sentiment going into the vote — the public had made up their minds.`
      : `${name} was the least-favored single islander in the final tally.`;
  return {
    eliminatedIds: [lowestId],
    type: "public_vote",
    reason,
    narrative: `The public has spoken! ${name} received the fewest votes and has been dumped from the island.`,
  };
}

export function islanderVoteElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[],
  viewerSentiment?: Record<string, number>,
): EliminationResult {
  const votes = new Map<string, number>();
  for (const a of active) votes.set(a.id, 0);

  for (const voter of active) {
    const partner = couples.find((c) => c.a === voter.id || c.b === voter.id);
    const partnerId = partner
      ? partner.a === voter.id
        ? partner.b
        : partner.a
      : null;

    let worstId = "";
    let worstScore = -Infinity;
    for (const candidate of active) {
      if (candidate.id === voter.id || candidate.id === partnerId) continue;
      const rel = relationships.find(
        (r) => r.fromId === voter.id && r.toId === candidate.id,
      );
      const candidateSentiment = viewerSentiment?.[candidate.id] ?? 50;
      const popularityNudge = (50 - candidateSentiment) * 0.4;
      const score =
        100 -
        (rel?.trust ?? 50) +
        (rel?.jealousy ?? 0) -
        (rel?.compatibility ?? 40) +
        popularityNudge;
      if (score > worstScore) {
        worstScore = score;
        worstId = candidate.id;
      }
    }
    if (worstId) {
      votes.set(worstId, (votes.get(worstId) ?? 0) + 1);
    }
  }

  let maxVotes = 0;
  let dumpedId = active[0]!.id;
  for (const [id, count] of votes) {
    if (
      count > maxVotes ||
      (count === maxVotes &&
        relationships
          .filter((r) => r.fromId === id)
          .reduce((s, r) => s + r.compatibility, 0) <
          relationships
            .filter((r) => r.fromId === dumpedId)
            .reduce((s, r) => s + r.compatibility, 0))
    ) {
      maxVotes = count;
      dumpedId = id;
    }
  }

  const name = active.find((a) => a.id === dumpedId)?.name ?? dumpedId;
  const totalVotes = Array.from(votes.values()).reduce((s, v) => s + v, 0);
  const sentiment = viewerSentiment?.[dumpedId] ?? 50;
  const sentimentText =
    sentiment < 30
      ? "viewer sentiment had turned against them"
      : sentiment < 50
        ? "public opinion was cooling off"
        : "the villa's own chemistry worked against them";
  const reason = `${name} received ${maxVotes} of ${totalVotes} islander votes — ${sentimentText}.`;
  return {
    eliminatedIds: [dumpedId],
    type: "islander_vote",
    reason,
    narrative: `The islanders have voted. ${name} must leave the villa tonight.`,
  };
}

export function producerIntervention(
  active: Agent[],
  dramaScores: Record<string, number>,
  relationships: Relationship[],
): EliminationResult {
  let lowestDrama = Infinity;
  let dumpedId = active[0]!.id;

  for (const agent of active) {
    const drama = dramaScores[agent.id] ?? 0;
    const agentRels = relationships.filter((r) => r.fromId === agent.id);
    const variance =
      agentRels.length > 0
        ? agentRels.reduce(
            (s, r) => s + Math.abs(r.attraction - 50) + Math.abs(r.trust - 50),
            0,
          ) / agentRels.length
        : 0;
    const score = drama + variance * 0.5;
    if (score < lowestDrama) {
      lowestDrama = score;
      dumpedId = agent.id;
    }
  }

  const name = active.find((a) => a.id === dumpedId)?.name ?? dumpedId;
  const reason = `${name} faded into the background — the producers sensed the audience tuning out whenever they were on screen and called time.`;
  return {
    eliminatedIds: [dumpedId],
    type: "producer_intervention",
    reason,
    narrative: `The producers have decided to shake things up... ${name}, your time in the villa is over.`,
  };
}
