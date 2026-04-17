import { useEffect, useState } from "react";
import { useVillaStore, restoreFromServer } from "@/store/useVillaStore";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { changeTrack } from "@/lib/music";
import EpisodeHeader from "@/features/episode/EpisodeHeader";
import BottomActionBar from "@/features/episode/BottomActionBar";
import SceneView from "@/features/scene/SceneView";
import CastList from "@/features/agents/CastList";
import RelationshipMatrix from "@/features/relationships/RelationshipMatrix";
import Drawer from "@/components/ui/Drawer";
import SessionModal from "@/components/ui/SessionModal";
import ViewerChat from "@/features/viewer/ViewerChat";

export default function App() {
  const cast = useVillaStore((s) => s.cast);
  const episode = useVillaStore((s) => s.episode);
  const ui = useVillaStore((s) => s.ui);
  const currentSceneId = useVillaStore((s) => s.currentSceneId);
  const toggleCast = useVillaStore((s) => s.toggleCast);
  const toggleRelationships = useVillaStore((s) => s.toggleRelationships);
  const setRelationshipMetric = useVillaStore((s) => s.setRelationshipMetric);
  const viewerMessages = useVillaStore((s) => s.viewerMessages);
  const generateScene = useVillaStore((s) => s.generateScene);
  const isGenerating = useVillaStore((s) => s.isGenerating);
  const sceneCount = episode.scenes.length;

  const bp = useBreakpoint();
  const [isRestoring, setIsRestoring] = useState(true);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);

  const currentScene = episode.scenes.find((s) => s.id === currentSceneId);
  const currentSceneType = currentScene?.type;

  useEffect(() => {
    restoreFromServer().finally(() => setIsRestoring(false));
  }, []);

  // Warm-on-mount: the FIRST scene of a fresh episode is structurally
  // live-gen (queue is empty by definition, nothing to prefetch), so
  // the user always waited 15-40s between clicking "start show" and
  // seeing any dialogue. We shortcut that by starting scene-0
  // generation the instant the app finishes loading a fresh episode —
  // well before the user reaches for the button. By the time they
  // click "start show", scene 0 is already generating (maybe already
  // ready). generateScene() is idempotent via its isGenerating guard,
  // so clicking the button while warm is in flight is a no-op.
  //
  // Guards: only warm fresh episodes (no prior scenes, no winner, not
  // paused) so we don't fire on a session-restore that already has
  // scenes, or on the post-finale screen.
  useEffect(() => {
    if (isRestoring) return;
    if (sceneCount !== 0) return;
    if (isGenerating) return;
    if (episode.winnerCouple) return;
    if (ui.isPaused) return;
    console.log("[warm-on-mount] starting scene 0 generation in background");
    generateScene();
  }, [
    isRestoring,
    sceneCount,
    isGenerating,
    episode.winnerCouple,
    ui.isPaused,
    generateScene,
  ]);

  useEffect(() => {
    if (currentSceneType) {
      changeTrack(currentSceneType);
    } else {
      changeTrack("menu");
    }
  }, [currentSceneType]);

  if (isRestoring) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-villa-bg crt">
        <div className="text-villa-pink text-xs uppercase tracking-widest animate-pulse">
          loading your villa...
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col bg-villa-bg crt">
      <EpisodeHeader onSessionClick={() => setSessionModalOpen(true)} />

      {bp === "desktop" ? (
        <div className="flex-1 grid grid-cols-[260px_1fr_320px] gap-3 p-3 overflow-hidden">
          <div className="overflow-hidden">
            <CastList
              cast={cast}
              emotions={episode.emotions}
              couples={episode.couples}
              eliminatedIds={episode.eliminatedIds}
              winnerCouple={episode.winnerCouple}
              locations={episode.locations}
              currentSceneType={currentSceneType}
              brains={episode.brains}
            />
          </div>
          <div className="flex flex-col overflow-hidden">
            <SceneView />
          </div>
          <div className="flex flex-col overflow-hidden gap-2">
            <div className="flex-1 overflow-hidden min-h-0">
              <RelationshipMatrix
                cast={cast}
                relationships={episode.relationships}
                metric={ui.activeRelationshipMetric}
                onMetricChange={setRelationshipMetric}
                eliminatedIds={episode.eliminatedIds}
              />
            </div>
            <div className="h-[200px] shrink-0">
              <ViewerChat messages={viewerMessages} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <SceneView />
        </div>
      )}

      <BottomActionBar
        onToggleCast={toggleCast}
        onToggleRelationships={toggleRelationships}
      />

      <Drawer open={ui.isCastOpen} onClose={toggleCast} title="cast">
        <CastList
          cast={cast}
          emotions={episode.emotions}
          couples={episode.couples}
          eliminatedIds={episode.eliminatedIds}
          winnerCouple={episode.winnerCouple}
          locations={episode.locations}
          currentSceneType={currentSceneType}
          brains={episode.brains}
        />
      </Drawer>

      <Drawer
        open={ui.isRelationshipsOpen}
        onClose={toggleRelationships}
        title="relationships"
      >
        <RelationshipMatrix
          cast={cast}
          relationships={episode.relationships}
          metric={ui.activeRelationshipMetric}
          onMetricChange={setRelationshipMetric}
          eliminatedIds={episode.eliminatedIds}
        />
      </Drawer>

      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
      />
    </div>
  );
}
