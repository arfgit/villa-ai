import { useEffect, useMemo } from "react";
import { useVillaStore } from "@/store/useVillaStore";
import Tooltip from "@/components/ui/Tooltip";
import clsx from "clsx";

export default function PastSeasonSummaryModal() {
  const archive = useVillaStore((s) => s.pastSeasonView);
  const viewerOpen = useVillaStore((s) => s.pastSeasonViewerOpen);
  const close = useVillaStore((s) => s.closePastSeasonSummary);
  const startViewer = useVillaStore((s) => s.startPastSeasonViewer);

  useEffect(() => {
    if (!archive || viewerOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [archive, viewerOpen, close]);

  const topFinalSentiment = useMemo(() => {
    if (!archive) return [];
    return Object.entries(archive.finalViewerSentiment ?? {})
      .map(([id, value]) => ({
        id,
        name: archive.castPool.find((a) => a.id === id)?.name ?? id,
        value: Number(value) || 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);
  }, [archive]);

  const topRelationships = useMemo(() => {
    if (!archive) return [];
    const rels = archive.finalRelationships ?? [];
    return [...rels]
      .sort((a, b) => b.attraction - a.attraction)
      .slice(0, 5)
      .map((r) => {
        const nameOf = (id: string) =>
          archive.castPool.find((a) => a.id === id)?.name ?? id;
        return {
          key: `${r.fromId}-${r.toId}`,
          from: nameOf(r.fromId),
          to: nameOf(r.toId),
          trust: r.trust,
          attraction: r.attraction,
          compat: r.compatibility,
        };
      });
  }, [archive]);

  if (!archive || viewerOpen) return null;

  const winners = archive.winnerCouple
    ? {
        a:
          archive.castPool.find((c) => c.id === archive.winnerCouple!.a)
            ?.name ?? archive.winnerCouple.a,
        b:
          archive.castPool.find((c) => c.id === archive.winnerCouple!.b)
            ?.name ?? archive.winnerCouple.b,
      }
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/70"
        onClick={close}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-villa-bg-2 border-2 border-villa-pink w-full max-w-xl max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between p-3 border-b border-villa-pink/30">
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] uppercase tracking-widest text-villa-pink">
                past season
              </span>
              <span className="text-villa-ink text-sm">
                Season {archive.seasonNumber}
              </span>
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="text-villa-dim text-xs px-1 transition-colors duration-200 ease-in hover:text-villa-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
            >
              ✕
            </button>
          </div>

          <div className="overflow-y-auto scrollbar-thin p-4 space-y-4 text-[11px]">
            {archive.seasonTheme && (
              <section>
                <div className="text-[9px] uppercase tracking-widest text-villa-pink/70 mb-1">
                  theme
                </div>
                <div className="text-villa-ink/90 leading-relaxed">
                  {archive.seasonTheme}
                </div>
              </section>
            )}

            <section>
              <div className="text-[9px] uppercase tracking-widest text-villa-pink/70 mb-1">
                cast ({archive.castPool.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {archive.castPool.map((agent) => {
                  const eliminated = archive.eliminatedIds.includes(agent.id);
                  const wonIt =
                    archive.winnerCouple &&
                    (archive.winnerCouple.a === agent.id ||
                      archive.winnerCouple.b === agent.id);
                  return (
                    <span
                      key={agent.id}
                      className={clsx(
                        "px-1.5 py-0.5 border text-[10px]",
                        wonIt
                          ? "border-villa-sun text-villa-sun"
                          : eliminated
                            ? "border-villa-dim/30 text-villa-dim line-through"
                            : "border-villa-pink/40 text-villa-ink/90",
                      )}
                    >
                      {agent.name}
                    </span>
                  );
                })}
              </div>
            </section>

            {winners && (
              <section>
                <div className="text-[9px] uppercase tracking-widest text-villa-sun/80 mb-1">
                  winners
                </div>
                <div className="border border-villa-sun/60 bg-villa-sun/5 px-3 py-2 text-villa-sun">
                  {winners.a} ❤ {winners.b}
                </div>
              </section>
            )}

            {topFinalSentiment.length > 0 && (
              <section>
                <div className="text-[9px] uppercase tracking-widest text-villa-pink/70 mb-1">
                  final popularity (top 3)
                </div>
                <ul className="space-y-0.5">
                  {topFinalSentiment.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 text-[10px]"
                    >
                      <span className="w-16 truncate text-villa-dim">
                        {s.name}
                      </span>
                      <span className="flex-1 h-1 bg-villa-dim/20 relative overflow-hidden">
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-0 left-0 bg-villa-sun/70"
                          style={{
                            width: `${Math.max(0, Math.min(100, Math.round(s.value)))}%`,
                          }}
                        />
                      </span>
                      <span className="w-8 text-right font-mono text-villa-sun">
                        {Math.round(s.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {topRelationships.length > 0 && (
              <section>
                <div className="text-[9px] uppercase tracking-widest text-villa-pink/70 mb-1">
                  strongest attractions (final)
                </div>
                <ul className="text-[10px] space-y-0.5 font-mono">
                  {topRelationships.map((r) => (
                    <li
                      key={r.key}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-villa-ink/90">
                        {r.from} → {r.to}
                      </span>
                      <span className="text-villa-dim">
                        <span className="text-villa-pink">
                          attr {r.attraction}
                        </span>
                        <span className="mx-1">·</span>
                        <span className="text-villa-trust">
                          trust {r.trust}
                        </span>
                        <span className="mx-1">·</span>
                        <span className="text-villa-sun">
                          compat {r.compat}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <div className="text-[9px] uppercase tracking-widest text-villa-pink/70 mb-1">
                scenes ({archive.scenes.length})
              </div>
              <ol className="text-[10px] space-y-0.5 list-decimal list-inside text-villa-ink/90">
                {archive.scenes.map((scene, i) => (
                  <li key={scene.id ?? i} className="truncate">
                    <span className="text-villa-dim">{scene.type}</span>
                    {scene.title ? ` · ${scene.title}` : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="border-t border-villa-pink/30 p-3 flex items-center justify-between gap-3">
            <span className="text-[9px] text-villa-dim">
              Archived{" "}
              {archive.archivedAt
                ? new Date(archive.archivedAt).toLocaleString()
                : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="text-[10px] uppercase tracking-widest border border-villa-dim/40 text-villa-dim px-3 py-1.5 transition-colors duration-200 ease-in hover:border-villa-pink hover:text-villa-pink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
              >
                close
              </button>
              <Tooltip
                content="Replay Season N in a scene-by-scene viewer. Doesn't change your current villa."
                side="top"
              >
                <button
                  onClick={startViewer}
                  className="text-[10px] uppercase tracking-widest border border-villa-pink text-villa-pink px-3 py-1.5 transition-colors duration-200 ease-in hover:bg-villa-pink hover:text-villa-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
                >
                  ▶ Watch Season {archive.seasonNumber}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
