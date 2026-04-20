import { useEffect, useState } from "react";
import { useVillaStore, restoreFromServer } from "@/store/useVillaStore";
import { ensureSessionId } from "@/lib/sessionId";
import { useBreakpoint } from "@/lib/useBreakpoint";
import { changeTrack } from "@/lib/music";
import EpisodeHeader from "@/features/episode/EpisodeHeader";
import BottomActionBar from "@/features/episode/BottomActionBar";
import SceneView from "@/features/scene/SceneView";
import CastList from "@/features/agents/CastList";
import RelationshipMatrix from "@/features/relationships/RelationshipMatrix";
import Drawer from "@/components/ui/Drawer";
import SessionModal from "@/components/ui/SessionModal";
import PastSeasonSummaryModal from "@/components/ui/PastSeasonSummaryModal";
import PastSeasonViewer from "@/components/ui/PastSeasonViewer";
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

  const bp = useBreakpoint();
  const [isRestoring, setIsRestoring] = useState(true);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);

  const [bootError, setBootError] = useState<string | null>(null);

  const currentScene = episode.scenes.find((s) => s.id === currentSceneId);
  const currentSceneType = currentScene?.type;

  const recoupleOrdinal =
    currentScene?.type === "recouple"
      ? episode.scenes
          .slice(
            0,
            episode.scenes.findIndex((s) => s.id === currentScene.id) + 1,
          )
          .filter((s) => s.type === "recouple").length
      : undefined;

  useEffect(() => {
    (async () => {
      try {
        await ensureSessionId();
        await restoreFromServer();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[boot] session resolution failed:", msg);
        setBootError(msg);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, []);

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

  if (bootError) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-villa-bg crt p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-villa-love text-xs uppercase tracking-widest">
            could not start session
          </div>
          {}
          <div className="text-villa-dim text-xs leading-relaxed break-words">
            Could not connect to the server. Check your connection and try
            again. If this keeps happening, the console log has details.
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-[10px] uppercase border border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-villa-pink"
          >
            reload
          </button>
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
              recoupleOrdinal={recoupleOrdinal}
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
                viewerSentiment={episode.viewerSentiment}
                couples={episode.couples}
                recentScenes={episode.scenes.slice(-3)}
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
          viewerSentiment={episode.viewerSentiment}
          couples={episode.couples}
        />
      </Drawer>

      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
      />

      <PastSeasonSummaryModal />
      <PastSeasonViewer />
    </div>
  );
}
