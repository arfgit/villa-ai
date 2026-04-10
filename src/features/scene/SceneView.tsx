import { useVillaStore } from '@/store/useVillaStore'
import AsciiStage from './AsciiStage'
import ChatBubbleFeed from '@/features/dialogue/ChatBubbleFeed'
import SystemChip from '@/features/dialogue/SystemChip'
import { useScenePlayback } from './useScenePlayback'

export default function SceneView() {
  useScenePlayback()

  const cast = useVillaStore((s) => s.cast)
  const episode = useVillaStore((s) => s.episode)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const currentLineIndex = useVillaStore((s) => s.currentLineIndex)
  const isGenerating = useVillaStore((s) => s.isGenerating)
  const lastError = useVillaStore((s) => s.lastError)

  const scene = episode.scenes.find((s) => s.id === currentSceneId)

  if (!scene) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex flex-col items-center max-w-sm">
          <pre className="ascii text-villa-pink text-xs sm:text-sm mb-4 inline-block">{`╔════════════════════╗
║                    ║
║      VILLA AI      ║
║    - season 1 -    ║
║                    ║
╚════════════════════╝`}</pre>
          <p className="text-villa-dim text-xs text-center">
            {isGenerating ? 'generating opening scene...' : 'press [▶ start show] to begin the season'}
          </p>
          {lastError && (
            <p className="text-villa-love text-xs mt-3 text-center">{lastError}</p>
          )}
        </div>
      </div>
    )
  }

  const participants = cast.filter((c) => scene.participantIds.includes(c.id))
  const currentLine = scene.dialogue[currentLineIndex]
  const speakingAgentId = currentLine?.agentId

  return (
    <div className="flex-1 flex flex-col gap-3 p-3 sm:p-4 overflow-y-auto scrollbar-thin relative">
      <AsciiStage
        sceneType={scene.type}
        participants={participants}
        speakingAgentId={speakingAgentId}
        emotions={episode.emotions}
      />

      <ChatBubbleFeed
        lines={scene.dialogue}
        cast={cast}
        currentLineIndex={currentLineIndex}
      />

      {scene.systemEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {scene.systemEvents.map((event) => (
            <SystemChip key={event.id} event={event} />
          ))}
        </div>
      )}

      {currentLineIndex >= scene.dialogue.length - 1 && (
        <div className="border border-villa-sun/40 bg-villa-sun/5 p-2 text-xs animate-villa-fadein">
          <span className="text-villa-sun uppercase tracking-wider">[outcome]</span>
          <span className="text-villa-ink ml-2">{scene.outcome}</span>
        </div>
      )}

      {isGenerating && (
        <div className="border border-villa-pink/60 bg-villa-bg-2/90 backdrop-blur p-3 text-xs flex items-center gap-2 animate-villa-fadein sticky bottom-0">
          <span className="inline-block animate-spin text-villa-pink">◐</span>
          <span className="text-villa-pink uppercase tracking-wider">writers room</span>
          <span className="text-villa-ink">drafting next scene...</span>
        </div>
      )}

      {lastError && (
        <div className="border border-villa-love/60 bg-villa-love/10 p-2 text-xs text-villa-love animate-villa-fadein">
          {lastError}
        </div>
      )}
    </div>
  )
}
