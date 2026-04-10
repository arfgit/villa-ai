import { useEffect } from 'react'
import { useVillaStore } from '@/store/useVillaStore'
import { useBreakpoint } from '@/lib/useBreakpoint'
import { changeTrack } from '@/lib/music'
import EpisodeHeader from '@/features/episode/EpisodeHeader'
import BottomActionBar from '@/features/episode/BottomActionBar'
import SceneView from '@/features/scene/SceneView'
import CastList from '@/features/agents/CastList'
import RelationshipMatrix from '@/features/relationships/RelationshipMatrix'
import Drawer from '@/components/ui/Drawer'

export default function App() {
  const cast = useVillaStore((s) => s.cast)
  const episode = useVillaStore((s) => s.episode)
  const ui = useVillaStore((s) => s.ui)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const toggleCast = useVillaStore((s) => s.toggleCast)
  const toggleRelationships = useVillaStore((s) => s.toggleRelationships)
  const setRelationshipMetric = useVillaStore((s) => s.setRelationshipMetric)

  const bp = useBreakpoint()

  useEffect(() => {
    const scene = episode.scenes.find((s) => s.id === currentSceneId)
    if (scene) {
      changeTrack(scene.type)
    } else {
      changeTrack('menu')
    }
  }, [currentSceneId, episode.scenes])

  return (
    <div className="h-[100dvh] flex flex-col bg-villa-bg crt">
      <EpisodeHeader />

      {bp === 'desktop' ? (
        <div className="flex-1 grid grid-cols-[260px_1fr_320px] gap-3 p-3 overflow-hidden">
          <div className="overflow-hidden">
            <CastList cast={cast} emotions={episode.emotions} couples={episode.couples} eliminatedIds={episode.eliminatedIds} winnerCouple={episode.winnerCouple} />
          </div>
          <div className="flex flex-col overflow-hidden">
            <SceneView />
          </div>
          <div className="overflow-hidden">
            <RelationshipMatrix
              cast={cast}
              relationships={episode.relationships}
              metric={ui.activeRelationshipMetric}
              onMetricChange={setRelationshipMetric}
              eliminatedIds={episode.eliminatedIds}
            />
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
        <CastList cast={cast} emotions={episode.emotions} couples={episode.couples} eliminatedIds={episode.eliminatedIds} winnerCouple={episode.winnerCouple} />
      </Drawer>

      <Drawer open={ui.isRelationshipsOpen} onClose={toggleRelationships} title="relationships">
        <RelationshipMatrix
          cast={cast}
          relationships={episode.relationships}
          metric={ui.activeRelationshipMetric}
          onMetricChange={setRelationshipMetric}
          eliminatedIds={episode.eliminatedIds}
        />
      </Drawer>
    </div>
  )
}
