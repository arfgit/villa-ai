import { useEffect, useRef, useState } from "react";
import { useVillaStore } from "@/store/useVillaStore";
import { getSceneLabel } from "@/data/environments";
import Tooltip from "@/components/ui/Tooltip";
import clsx from "clsx";

interface Props {
  onSessionClick?: () => void;
}

export default function EpisodeHeader({ onSessionClick }: Props) {
  const episode = useVillaStore((s) => s.episode);
  const currentSceneId = useVillaStore((s) => s.currentSceneId);
  const selectScene = useVillaStore((s) => s.selectScene);
  const pastSeasons = useVillaStore((s) => s.pastSeasons);
  const pastSeasonsLoading = useVillaStore((s) => s.pastSeasonsLoading);
  const refreshPastSeasons = useVillaStore((s) => s.refreshPastSeasons);
  const openPastSeasonSummary = useVillaStore((s) => s.openPastSeasonSummary);

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSceneIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentSceneId || !scrollRef.current) {
      prevSceneIdRef.current = currentSceneId;
      return;
    }
    const scenes = episode.scenes;
    const prevIdx = scenes.findIndex((s) => s.id === prevSceneIdRef.current);
    const curIdx = scenes.findIndex((s) => s.id === currentSceneId);
    const wasFollowingAlong = prevIdx >= 0 && curIdx === prevIdx + 1;

    if (wasFollowingAlong) {
      const safeId = CSS.escape(currentSceneId);
      const btn = scrollRef.current.querySelector(
        `[data-scene-id="${safeId}"]`,
      );
      btn?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }

    prevSceneIdRef.current = currentSceneId;
  }, [currentSceneId, episode.scenes]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onClickAway(e: MouseEvent) {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [pickerOpen]);

  async function togglePicker() {
    const next = !pickerOpen;
    setPickerOpen(next);
    if (next) await refreshPastSeasons();
  }

  const hasPastSeasons = pastSeasons.length > 0 || episode.number > 1;

  return (
    <header className="border-b border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 sm:px-4 py-2 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-villa-pink text-lg">♥</span>
        <span className="text-sm font-bold tracking-widest uppercase">
          VILLA AI
        </span>
      </div>
      <div ref={pickerRef} className="relative shrink-0">
        <Tooltip
          content={
            hasPastSeasons
              ? "Click to view past seasons from this session."
              : "No past seasons yet — finish this season and start a new one to archive it here."
          }
          side="bottom"
        >
          <button
            type="button"
            onClick={hasPastSeasons ? togglePicker : undefined}
            disabled={!hasPastSeasons}
            aria-expanded={pickerOpen}
            aria-haspopup="menu"
            className={clsx(
              "text-[10px] uppercase tracking-widest px-2 py-0.5 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink",
              hasPastSeasons
                ? "border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink cursor-pointer"
                : "border-transparent text-villa-dim cursor-default",
            )}
          >
            Season {episode.number}
            {hasPastSeasons ? (
              <span aria-hidden="true" className="ml-1">
                ▾
              </span>
            ) : null}
          </button>
        </Tooltip>
        {pickerOpen && (
          <div
            role="menu"
            className="absolute left-0 top-full mt-1 z-30 min-w-[220px] max-w-[320px] border border-villa-pink/40 bg-villa-bg-2/95 backdrop-blur shadow-lg"
          >
            <div className="px-3 py-2 border-b border-villa-pink/20 text-[9px] uppercase tracking-widest text-villa-pink/70 flex items-center justify-between">
              <span>past seasons</span>
              {pastSeasonsLoading && (
                <span className="text-villa-dim">loading…</span>
              )}
            </div>
            {pastSeasons.length === 0 && !pastSeasonsLoading ? (
              <div className="px-3 py-3 text-[11px] text-villa-dim">
                No archived seasons yet.
              </div>
            ) : (
              <ul className="max-h-[40vh] overflow-y-auto scrollbar-thin">
                {pastSeasons.map((s) => (
                  <li key={s.seasonNumber}>
                    <button
                      type="button"
                      onClick={async () => {
                        setPickerOpen(false);
                        await openPastSeasonSummary(s.seasonNumber);
                      }}
                      className="w-full text-left px-3 py-2 text-[11px] border-b border-villa-pink/10 hover:bg-villa-pink/5 focus-visible:outline-none focus-visible:bg-villa-pink/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-villa-ink">
                          Season {s.seasonNumber}
                        </span>
                        <span className="text-villa-dim text-[9px]">
                          {s.sceneCount} scene{s.sceneCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      {s.seasonTheme && (
                        <div className="text-[9px] text-villa-dim truncate mt-0.5">
                          {s.seasonTheme}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {onSessionClick && (
        <Tooltip
          content="View your session key or load an existing villa session."
          side="bottom"
        >
          <button
            onClick={onSessionClick}
            className="text-[10px] uppercase tracking-widest border border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua px-2 py-0.5 shrink-0"
          >
            session
          </button>
        </Tooltip>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto scrollbar-thin flex gap-1"
      >
        {episode.scenes.map((scene, i) => {
          const recoupleOrdinal =
            scene.type === "recouple"
              ? episode.scenes
                  .slice(0, i + 1)
                  .filter((s) => s.type === "recouple").length
              : 0;
          const label = getSceneLabel(scene.type, recoupleOrdinal);
          return (
            <button
              key={scene.id}
              data-scene-id={scene.id}
              onClick={() => selectScene(scene.id)}
              className={clsx(
                "px-2 py-0.5 text-[10px] border whitespace-nowrap shrink-0",
                scene.id === currentSceneId
                  ? "border-villa-pink text-villa-pink"
                  : "border-villa-dim/40 text-villa-dim hover:border-villa-dim",
              )}
            >
              {i + 1}. {label.emoji} {label.title}
            </button>
          );
        })}
      </div>
    </header>
  );
}
