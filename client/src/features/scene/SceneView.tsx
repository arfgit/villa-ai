import { useEffect, useRef } from "react";
import { useVillaStore } from "@/store/useVillaStore";
import AsciiStage from "./AsciiStage";
import ChatBubbleFeed from "@/features/dialogue/ChatBubbleFeed";
import SystemChip from "@/features/dialogue/SystemChip";
import { useScenePlayback } from "./useScenePlayback";
import { HOST } from "@/data/host";
import { isLoudLine } from "@/lib/dialogueIntensity";

export default function SceneView() {
  useScenePlayback();

  const cast = useVillaStore((s) => s.cast);
  const episode = useVillaStore((s) => s.episode);
  const currentSceneId = useVillaStore((s) => s.currentSceneId);
  const currentLineIndex = useVillaStore((s) => s.currentLineIndex);
  const isGenerating = useVillaStore((s) => s.isGenerating);
  const lastError = useVillaStore((s) => s.lastError);

  const scene = episode.scenes.find((s) => s.id === currentSceneId);
  const currentLine = scene?.dialogue[currentLineIndex];

  // ALL HOOKS MUST RUN BEFORE ANY EARLY RETURN — Rules of Hooks require the
  // same call order every render. Keep useRef/useEffect up here; the scene
  // may be undefined while we wait for the first scene to generate.
  const rootRef = useRef<HTMLDivElement>(null);
  const shakeKey =
    scene && currentLine && isLoudLine(currentLine)
      ? `${scene.id}-${currentLineIndex}`
      : null;
  useEffect(() => {
    if (!shakeKey) return;
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove("animate-villa-shake");
    // Force reflow so the browser restarts the animation on re-add.
    void el.offsetWidth;
    el.classList.add("animate-villa-shake");
  }, [shakeKey]);

  if (!scene) {
    const seasonLabel = `- season ${episode.number} -`;
    const pad = Math.max(0, 20 - seasonLabel.length);
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;
    const centeredSeason =
      " ".repeat(leftPad) + seasonLabel + " ".repeat(rightPad);
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center max-w-sm">
          <pre className="ascii text-villa-pink text-xs sm:text-sm mb-4 inline-block">{`╔════════════════════╗
║                    ║
║      VILLA AI      ║
║${centeredSeason}║
║                    ║
╚════════════════════╝`}</pre>
          <p className="text-villa-dim text-xs text-center">
            {isGenerating
              ? "generating opening scene..."
              : "press [▶ start show] to begin the season"}
          </p>
          {lastError && (
            <p className="text-villa-love text-xs mt-3 text-center">
              {lastError}
            </p>
          )}
        </div>
      </div>
    );
  }

  const participants = cast.filter((c) => scene.participantIds.includes(c.id));
  const speakingAgentId = currentLine?.agentId;
  const targetAgentId = currentLine?.targetAgentId;
  const isLastLine = currentLineIndex >= scene.dialogue.length - 1;
  const sceneNumber = episode.scenes.findIndex((s) => s.id === scene.id) + 1;
  const recoupleOrdinal =
    scene.type === "recouple"
      ? episode.scenes
          .slice(0, sceneNumber)
          .filter((s) => s.type === "recouple").length
      : 0;
  const hostScenes: (typeof scene.type)[] = [
    "recouple",
    "bombshell",
    "minigame",
    "challenge",
  ];
  const showHost = sceneNumber === 1 || hostScenes.includes(scene.type);

  // Recouple stage progression: count host "officially a couple" confirmations
  // up to the currently-played line, then reveal that many pairings from the
  // ordered couple_formed events. This lets the stage cluster each pair as the
  // host calls them out, instead of showing all pairings at once from scene 0.
  const announcedPairs: Array<{ a: string; b: string }> = [];
  if (scene.type === "recouple") {
    const coupleFormedEvents = scene.systemEvents
      .filter((e) => e.type === "couple_formed" && e.fromId && e.toId)
      .map((e) => ({ a: e.fromId!, b: e.toId! }));
    const confirmationRe = /officially|now a couple|coupled up/i;
    let announcedCount = 0;
    for (let i = 0; i <= currentLineIndex && i < scene.dialogue.length; i++) {
      const line = scene.dialogue[i]!;
      if (line.agentId === HOST.id && confirmationRe.test(line.text)) {
        announcedCount += 1;
      }
    }
    announcedPairs.push(
      ...coupleFormedEvents.slice(
        0,
        Math.min(announcedCount, coupleFormedEvents.length),
      ),
    );
  }
  const focusedPair = announcedPairs[announcedPairs.length - 1] ?? null;

  return (
    <div
      ref={rootRef}
      className="flex-1 flex flex-col gap-2 p-2 sm:p-3 overflow-y-auto scrollbar-thin relative"
    >
      <AsciiStage
        sceneType={scene.type}
        participants={participants}
        speakingAgentId={speakingAgentId}
        targetAgentId={targetAgentId}
        emotions={episode.emotions}
        sceneNumber={sceneNumber}
        totalScenes={episode.scenes.length}
        host={showHost ? HOST : undefined}
        recoupleOrdinal={recoupleOrdinal}
        announcedPairs={announcedPairs}
        focusedPair={focusedPair}
        couples={episode.couples}
      />

      <div className="h-[200px] sm:h-[220px] flex flex-col flex-shrink-0">
        <ChatBubbleFeed
          lines={scene.dialogue}
          cast={cast}
          currentLineIndex={currentLineIndex}
        />
      </div>

      <div className="min-h-[60px] flex flex-col gap-2">
        {isLastLine &&
          scene.systemEvents.filter((e) => e.type !== "gravity_shift").length >
            0 && (
            <div className="flex flex-wrap gap-1.5 animate-villa-fadein">
              {scene.systemEvents
                .filter((event) => event.type !== "gravity_shift")
                .map((event) => (
                  <SystemChip key={event.id} event={event} />
                ))}
            </div>
          )}

        {isLastLine && (
          <div className="border border-villa-sun/40 bg-villa-sun/5 p-2 text-xs animate-villa-fadein">
            <span className="text-villa-sun uppercase tracking-wider">
              [outcome]
            </span>
            <span className="text-villa-ink ml-2">{scene.outcome}</span>
          </div>
        )}
      </div>

      {/*
        Winners banner ONLY shows when the user is viewing the grand finale
        scene (the one that actually crowned them). Previously, any scene
        cycle while winnerCouple was set would render this banner, hiding
        the scene's own [outcome] block for mid-season scenes — so flipping
        back through history you'd see "★ winners ★" stuck over the scene-2
        outcome. Gate on scene.type === "grand_finale" so the banner only
        appears on its native scene.
      */}
      {episode.winnerCouple && isLastLine && scene.type === "grand_finale" && (
        <div className="border-2 border-villa-sun bg-villa-sun/10 p-3 text-center animate-villa-fadein">
          <div className="text-[10px] uppercase tracking-widest text-villa-sun mb-1">
            ★ winners of the villa ★
          </div>
          <div className="text-sm">
            {cast.find((c) => c.id === episode.winnerCouple!.a)?.name}{" "}
            &nbsp;❤&nbsp;{" "}
            {cast.find((c) => c.id === episode.winnerCouple!.b)?.name}
          </div>
        </div>
      )}

      {lastError && (
        <div className="border border-villa-love/60 bg-villa-love/10 p-2 text-xs text-villa-love animate-villa-fadein">
          {lastError}
        </div>
      )}
    </div>
  );
}
