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
        <div className="text-center max-w-sm">
          <pre className="ascii text-villa-pink text-xs mb-4">{`╔══════════════════╗
║   VILLA   AI     ║
║   - season 1 -   ║
╚══════════════════╝`}</pre>
          <p className="text-villa-dim text-xs">
            {isGenerating ? 'generating opening scene...' : 'press [next scene] to begin the season'}
          </p>
          {lastError && (
            <p className="text-villa-love text-xs mt-3">{lastError}</p>
          )}
        </div>
      </div>
    )
  }

  const participants = cast.filter((c) => scene.participantIds.includes(c.id))
  const currentLine = scene.dialogue[currentLineIndex]
  const speakingAgentId = currentLine?.agentId

  return (
    <div className="flex-1 flex flex-col gap-3 p-3 sm:p-4 overflow-y-auto scrollbar-thin">
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
        <div className="border border-villa-sun/40 bg-villa-sun/5 p-2 text-xs">
          <span className="text-villa-sun uppercase tracking-wider">[outcome]</span>
          <span className="text-villa-ink ml-2">{scene.outcome}</span>
        </div>
      )}
    </div>
  )
}
