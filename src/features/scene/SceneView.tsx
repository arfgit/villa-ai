import { useVillaStore } from '@/store/useVillaStore'
import AsciiStage from './AsciiStage'
import ChatBubbleFeed from '@/features/dialogue/ChatBubbleFeed'
import SystemChip from '@/features/dialogue/SystemChip'
import { useScenePlayback } from './useScenePlayback'
import { HOST } from '@/data/host'

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
  const targetAgentId = currentLine?.targetAgentId
  const isLastLine = currentLineIndex >= scene.dialogue.length - 1
  const sceneNumber = episode.scenes.findIndex((s) => s.id === scene.id) + 1
  const recoupleOrdinal = scene.type === 'recouple'
    ? episode.scenes.slice(0, sceneNumber).filter((s) => s.type === 'recouple').length
    : 0
  const hostScenes: typeof scene.type[] = ['recouple', 'bombshell', 'minigame', 'challenge']
  const showHost = sceneNumber === 1 || hostScenes.includes(scene.type)

  return (
    <div className="flex-1 flex flex-col gap-2 p-2 sm:p-3 overflow-y-auto scrollbar-thin relative">
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
      />

      <div className="h-[200px] sm:h-[220px] flex flex-col flex-shrink-0">
        <ChatBubbleFeed
          lines={scene.dialogue}
          cast={cast}
          currentLineIndex={currentLineIndex}
        />
      </div>

      <div className="min-h-[60px] flex flex-col gap-2">
        {isLastLine && scene.systemEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 animate-villa-fadein">
            {scene.systemEvents.map((event) => (
              <SystemChip key={event.id} event={event} />
            ))}
          </div>
        )}

        {isLastLine && (
          <div className="border border-villa-sun/40 bg-villa-sun/5 p-2 text-xs animate-villa-fadein">
            <span className="text-villa-sun uppercase tracking-wider">[outcome]</span>
            <span className="text-villa-ink ml-2">{scene.outcome}</span>
          </div>
        )}
      </div>

      {episode.winnerCouple && isLastLine && (
        <div className="border-2 border-villa-sun bg-villa-sun/10 p-3 text-center animate-villa-fadein">
          <div className="text-[10px] uppercase tracking-widest text-villa-sun mb-1">★ winners of the villa ★</div>
          <div className="text-sm">
            {cast.find((c) => c.id === episode.winnerCouple!.a)?.name} &nbsp;❤&nbsp; {cast.find((c) => c.id === episode.winnerCouple!.b)?.name}
          </div>
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
