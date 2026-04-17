import { useMemo } from "react";
import clsx from "clsx";
import type { Agent, EmotionState, SceneType, Host } from "@/types";
import { ENVIRONMENTS, getSceneLabel } from "@/data/environments";
import AgentAscii from "@/features/agents/AgentAscii";
import HostAscii from "@/features/agents/HostAscii";

interface Props {
  sceneType: SceneType;
  participants: Agent[];
  speakingAgentId?: string;
  targetAgentId?: string;
  emotions: EmotionState[];
  sceneNumber: number;
  totalScenes?: number;
  host?: Host;
  recoupleOrdinal?: number;
  announcedPairs?: Array<{ a: string; b: string }>;
  focusedPair?: { a: string; b: string } | null;
}

export default function AsciiStage({
  sceneType,
  participants,
  speakingAgentId,
  targetAgentId,
  emotions,
  sceneNumber,
  host,
  recoupleOrdinal,
  announcedPairs,
  focusedPair,
}: Props) {
  const env = ENVIRONMENTS[sceneType];
  const label = getSceneLabel(sceneType, recoupleOrdinal);

  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? "neutral";
  }

  const basePositions = useMemo(() => {
    const result: Record<string, { left: number; bottom: number }> = {};
    const n = participants.length;
    if (n === 0) return result;
    if (n === 1) {
      result[participants[0]!.id] = { left: 50, bottom: 8 };
      return result;
    }

    // During a recouple, once a pair is announced we cluster those two agents
    // side-by-side so the ceremony reads as couples forming in sequence
    // instead of a still group shot. Unpaired agents line up on the front row.
    const pairOrder = announcedPairs ?? [];
    if (pairOrder.length > 0) {
      const paired = new Set<string>();
      for (const p of pairOrder) {
        paired.add(p.a);
        paired.add(p.b);
      }
      const unpaired = participants.filter((a) => !paired.has(a.id));
      pairOrder.forEach((pair, idx) => {
        const t = pairOrder.length <= 1 ? 0.5 : idx / (pairOrder.length - 1);
        const center = 14 + t * 72;
        result[pair.a] = { left: center - 6, bottom: 56 };
        result[pair.b] = { left: center + 6, bottom: 56 };
      });
      unpaired.forEach((agent, idx) => {
        const t = unpaired.length <= 1 ? 0.5 : idx / (unpaired.length - 1);
        result[agent.id] = { left: 14 + t * 72, bottom: 4 };
      });
      return result;
    }

    // Beyond ~6 on stage, a single row forces sprites to overlap horizontally.
    // Stagger into two rows: even indices on the back row (higher), odd on the
    // front row (lower), so crowds read cleanly.
    const MAX_PER_ROW = 6;
    const rows = n > MAX_PER_ROW ? 2 : 1;
    const backCount = rows === 2 ? Math.ceil(n / 2) : n;
    const frontCount = rows === 2 ? n - backCount : 0;

    participants.forEach((agent, idx) => {
      const onBackRow = rows === 1 ? true : idx % 2 === 0;
      const rowIdx = rows === 1 ? idx : Math.floor(idx / 2);
      const rowSize = onBackRow ? backCount : frontCount;
      const t = rowSize <= 1 ? 0.5 : rowIdx / (rowSize - 1);
      const left = 10 + t * 80;
      const arc = Math.sin(t * Math.PI) * 4;
      const bottom = rows === 2 ? (onBackRow ? 56 : 4) + arc : 4 + arc * 1.5;
      result[agent.id] = { left, bottom };
    });
    return result;
  }, [participants, announcedPairs]);

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{label.emoji}</span>
          <span>{label.title}</span>
        </div>
        <span className="text-villa-dim">ep {sceneNumber}</span>
      </div>

      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1 max-h-[140px] sm:max-h-[160px]">
        <pre className="ascii text-villa-dim text-[9px] sm:text-[11px] leading-tight animate-villa-shimmer inline-block">
          {env}
        </pre>
      </div>

      <div
        className={clsx(
          "mt-2 relative w-full",
          participants.length > 6
            ? host
              ? "h-[210px] sm:h-[220px]"
              : "h-[170px] sm:h-[180px]"
            : host
              ? "h-[160px] sm:h-[170px]"
              : "h-[120px] sm:h-[130px]",
        )}
      >
        {host && (
          <div
            className="absolute left-1/2 top-0 z-30"
            style={{ transform: "translateX(-50%)" }}
          >
            <HostAscii host={host} speaking={speakingAgentId === host.id} />
          </div>
        )}
        {participants.map((agent) => {
          const base = basePositions[agent.id] ?? { left: 50, bottom: 4 };
          const isSpeaking = agent.id === speakingAgentId;
          const isTarget = agent.id === targetAgentId;
          const isFocusedPair =
            !!focusedPair &&
            (agent.id === focusedPair.a || agent.id === focusedPair.b);

          const speakerBoost = isSpeaking ? 10 : 0;
          const targetBoost = isTarget ? 4 : 0;
          const speakerBase =
            isSpeaking || isTarget
              ? base.bottom + speakerBoost + targetBoost
              : base.bottom;

          let leanLeft = base.left;
          if (isTarget && speakingAgentId) {
            const speakerPos = basePositions[speakingAgentId];
            if (speakerPos) {
              leanLeft = base.left + (speakerPos.left - base.left) * 0.12;
            }
          }

          return (
            <div
              key={agent.id}
              className={clsx(
                "absolute transition-all duration-700 ease-in-out",
                isSpeaking && "z-20",
                isTarget && "z-10",
                isFocusedPair && "drop-shadow-[0_0_10px_rgba(255,77,109,0.7)]",
              )}
              style={{
                left: `${leanLeft}%`,
                bottom: `${speakerBase}px`,
                transform: "translateX(-50%)",
              }}
            >
              <AgentAscii
                agent={agent}
                emotion={getEmotion(agent.id)}
                size="md"
                highlighted={isSpeaking}
                sceneType={sceneType}
              />
            </div>
          );
        })}
        {participants.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-villa-dim text-xs italic">
            empty stage
          </div>
        )}
      </div>
    </div>
  );
}
