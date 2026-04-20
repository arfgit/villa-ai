import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useVillaStore } from "@/store/useVillaStore";
import AsciiStage from "@/features/scene/AsciiStage";
import ChatBubbleFeed from "@/features/dialogue/ChatBubbleFeed";
import SystemChip from "@/features/dialogue/SystemChip";
import ViewerChat from "@/features/viewer/ViewerChat";
import { HOST } from "@/data/host";
import { getSceneLabel } from "@/data/environments";

export default function PastSeasonViewer() {
  const archive = useVillaStore((s) => s.pastSeasonView);
  const viewerOpen = useVillaStore((s) => s.pastSeasonViewerOpen);
  const closeViewer = useVillaStore((s) => s.closePastSeasonViewer);
  const closeSummary = useVillaStore((s) => s.closePastSeasonSummary);

  const [sceneIdx, setSceneIdx] = useState(0);

  useEffect(() => {
    if (!viewerOpen) return;
    setSceneIdx(0);
  }, [viewerOpen, archive?.seasonNumber]);

  useEffect(() => {
    if (!viewerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowRight" && archive) {
        setSceneIdx((i) => Math.min(i + 1, archive.scenes.length - 1));
      }
      if (e.key === "ArrowLeft") {
        setSceneIdx((i) => Math.max(0, i - 1));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewerOpen, closeViewer, archive]);

  const scene = useMemo(
    () => archive?.scenes[sceneIdx] ?? null,
    [archive, sceneIdx],
  );

  const hostScenes = new Set([
    "recouple",
    "bombshell",
    "minigame",
    "challenge",
    "introductions",
    "grand_finale",
  ]);

  if (!archive || !viewerOpen || !scene) return null;

  const participants = archive.castPool.filter((c) =>
    scene.participantIds.includes(c.id),
  );
  const sceneCount = archive.scenes.length;
  const recoupleOrdinal =
    scene.type === "recouple"
      ? archive.scenes
          .slice(0, sceneIdx + 1)
          .filter((s) => s.type === "recouple").length
      : 0;
  const label = getSceneLabel(scene.type, recoupleOrdinal);
  const showHost = sceneIdx === 0 || hostScenes.has(scene.type);

  return (
    <div
      className="fixed inset-0 z-[60] bg-villa-bg crt flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Watching archived Season ${archive.seasonNumber}`}
    >
      <header className="border-b border-villa-pink/40 bg-villa-bg-2/80 backdrop-blur px-3 sm:px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-[10px] uppercase tracking-widest text-villa-sun">
          ▶ history mode
        </span>
        <span className="text-sm text-villa-ink">
          Season {archive.seasonNumber}
        </span>
        <span className="hidden md:inline text-[10px] text-villa-dim truncate max-w-[32ch]">
          · {label.title}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSceneIdx((i) => Math.max(0, i - 1))}
            disabled={sceneIdx === 0}
            className="text-[10px] uppercase tracking-widest border border-villa-dim/40 text-villa-dim px-2 py-0.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 ease-in hover:border-villa-pink hover:text-villa-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
          >
            ◀ prev
          </button>
          <span className="text-[10px] text-villa-dim tabular-nums">
            {sceneIdx + 1} / {sceneCount}
          </span>
          <button
            type="button"
            onClick={() => setSceneIdx((i) => Math.min(i + 1, sceneCount - 1))}
            disabled={sceneIdx >= sceneCount - 1}
            className="text-[10px] uppercase tracking-widest border border-villa-dim/40 text-villa-dim px-2 py-0.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 ease-in hover:border-villa-pink hover:text-villa-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
          >
            next ▶
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            closeViewer();
            closeSummary();
          }}
          className="text-[10px] uppercase tracking-widest border border-villa-pink text-villa-pink px-3 py-1 transition-colors duration-200 ease-in hover:bg-villa-pink hover:text-villa-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
          aria-label="Exit history mode"
        >
          ✕ exit
        </button>
      </header>

      <div className="border-b border-villa-pink/20 px-3 py-1 flex items-center gap-1 overflow-x-auto scrollbar-thin shrink-0">
        {archive.scenes.map((s, i) => {
          const ro =
            s.type === "recouple"
              ? archive.scenes
                  .slice(0, i + 1)
                  .filter((x) => x.type === "recouple").length
              : 0;
          const l = getSceneLabel(s.type, ro);
          return (
            <button
              key={s.id ?? i}
              onClick={() => setSceneIdx(i)}
              className={clsx(
                "px-2 py-0.5 text-[10px] border whitespace-nowrap shrink-0 transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink",
                i === sceneIdx
                  ? "border-villa-pink text-villa-pink"
                  : "border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink",
              )}
            >
              {i + 1}. {l.emoji} {l.title}
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col gap-3 p-2 sm:p-3 overflow-y-auto scrollbar-thin">
        <AsciiStage
          sceneType={scene.type}
          participants={participants}
          speakingAgentId={undefined}
          targetAgentId={undefined}
          emotions={[]}
          sceneNumber={sceneIdx + 1}
          totalScenes={sceneCount}
          host={showHost ? HOST : undefined}
          recoupleOrdinal={recoupleOrdinal}
        />

        <div className="flex flex-col flex-shrink-0">
          <ChatBubbleFeed
            lines={scene.dialogue}
            cast={archive.castPool}
            currentLineIndex={scene.dialogue.length - 1}
          />
        </div>

        {scene.systemEvents.filter((e) => e.type !== "gravity_shift").length >
          0 && (
          <div className="flex flex-wrap gap-1.5">
            {scene.systemEvents
              .filter((event) => event.type !== "gravity_shift")
              .map((event) => (
                <SystemChip key={event.id} event={event} />
              ))}
          </div>
        )}

        {scene.outcome && (
          <section
            aria-label="Scene outcome"
            className="border border-villa-sun/60 border-l-4 bg-villa-bg-2 p-3 flex flex-col gap-1"
          >
            <span className="text-villa-sun uppercase tracking-wider text-[10px]">
              [outcome]
            </span>
            <p className="text-villa-ink text-sm leading-relaxed whitespace-pre-wrap">
              {scene.outcome}
            </p>
          </section>
        )}

        {archive.viewerMessages && archive.viewerMessages.length > 0 && (
          <div className="h-[220px] shrink-0">
            <ViewerChat messages={archive.viewerMessages} />
          </div>
        )}
      </div>
    </div>
  );
}
