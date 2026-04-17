import { useEffect } from "react";
import { useVillaStore } from "@/store/useVillaStore";

export function useScenePlayback() {
  const advanceLine = useVillaStore((s) => s.advanceLine);
  const generateScene = useVillaStore((s) => s.generateScene);
  const triggerPrefetch = useVillaStore((s) => s.triggerPrefetch);
  const currentSceneId = useVillaStore((s) => s.currentSceneId);
  const currentLineIndex = useVillaStore((s) => s.currentLineIndex);
  const lineDelayMs = useVillaStore((s) => s.ui.lineDelayMs);
  const isPaused = useVillaStore((s) => s.ui.isPaused);
  const isGenerating = useVillaStore((s) => s.isGenerating);
  const winner = useVillaStore((s) => s.episode.winnerCouple);

  const totalLines = useVillaStore((s) => {
    const scene = s.episode.scenes.find((sc) => sc.id === s.currentSceneId);
    return scene?.dialogue.length ?? 0;
  });

  // When a scene starts playing, kick prefetch. The writers room runs while
  // we're watching dialogue — which is free wallclock that would otherwise
  // be spent idle. triggerPrefetch is idempotent (single-flight guard in
  // the runner), so this is safe even if post-commit already fired.
  useEffect(() => {
    if (!currentSceneId) return;
    if (currentLineIndex !== 0) return;
    triggerPrefetch();
  }, [currentSceneId, currentLineIndex, triggerPrefetch]);

  useEffect(() => {
    if (isPaused) return;
    if (!currentSceneId || isGenerating || totalLines === 0) return;

    const isLast = currentLineIndex >= totalLines - 1;

    if (!isLast) {
      const t = setTimeout(() => {
        if (useVillaStore.getState().ui.isPaused) return;
        advanceLine();
      }, lineDelayMs);
      return () => clearTimeout(t);
    }

    if (winner) return;

    const t = setTimeout(() => {
      if (useVillaStore.getState().ui.isPaused) return;
      generateScene();
    }, lineDelayMs * 2);
    return () => clearTimeout(t);
  }, [
    currentSceneId,
    currentLineIndex,
    totalLines,
    lineDelayMs,
    isPaused,
    isGenerating,
    advanceLine,
    generateScene,
    winner,
  ]);
}
