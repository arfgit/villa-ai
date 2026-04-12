import clsx from 'clsx'
import { useVillaStore } from '@/store/useVillaStore'
import { startMusic, stopMusic } from '@/lib/music'
import Tooltip from '@/components/ui/Tooltip'

interface Props {
  onToggleCast: () => void
  onToggleRelationships: () => void
}

export default function BottomActionBar({ onToggleCast, onToggleRelationships }: Props) {
  const generateScene = useVillaStore((s) => s.generateScene)
  const startNewEpisode = useVillaStore((s) => s.startNewEpisode)
  const exportSeasonData = useVillaStore((s) => s.exportSeasonData)
  const exportRLData = useVillaStore((s) => s.exportRLData)
  const isGenerating = useVillaStore((s) => s.isGenerating)
  const generationProgress = useVillaStore((s) => s.generationProgress)
  const tooltipsEnabled = useVillaStore((s) => s.ui.tooltipsEnabled)
  const toggleTooltips = useVillaStore((s) => s.toggleTooltips)
  const musicEnabled = useVillaStore((s) => s.ui.musicEnabled)
  const toggleMusic = useVillaStore((s) => s.toggleMusic)
  const isPaused = useVillaStore((s) => s.ui.isPaused)
  const togglePause = useVillaStore((s) => s.togglePause)
  const sceneCount = useVillaStore((s) => s.episode.scenes.length)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const winnerCouple = useVillaStore((s) => s.episode.winnerCouple)
  const lastError = useVillaStore((s) => s.lastError)
  const currentSceneType = useVillaStore((s) => {
    const scene = s.episode.scenes.find((sc) => sc.id === s.currentSceneId)
    return scene?.type
  })
  // True only when the *final* scene of the season has finished playing.
  // winnerCouple is set as soon as the finale scene is generated, so we can't
  // gate UI on that alone — we still need to show pause during the finale's
  // dialogue playback.
  const seasonOver = useVillaStore((s) => {
    if (!s.episode.winnerCouple) return false
    const scene = s.episode.scenes.find((sc) => sc.id === s.currentSceneId)
    if (!scene) return true
    return s.currentLineIndex >= scene.dialogue.length - 1
  })

  const showStart = sceneCount === 0 && !isGenerating
  const showNewSeason = seasonOver && !isGenerating
  const showRetry = lastError !== null && !isGenerating && sceneCount > 0 && !winnerCouple
  const showPause = currentSceneId !== null && !seasonOver

  function handleMusicClick() {
    if (musicEnabled) {
      stopMusic()
    } else {
      startMusic(currentSceneType ?? 'menu').catch(() => {})
    }
    toggleMusic()
  }

  return (
    <div className="border-t border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-widest border leading-none min-w-[200px] min-h-[48px] transition-opacity duration-300',
        isGenerating ? 'border-villa-pink/60 text-villa-pink opacity-100' : 'border-transparent opacity-0 pointer-events-none absolute'
      )}>
        <div className="flex flex-col gap-1.5 w-full">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className={clsx('inline-block', isGenerating && 'animate-spin')}>◐</span>
              <span>writers room</span>
            </div>
            <span className={clsx('text-[10px] tabular-nums', !generationProgress && 'opacity-0')}>
              {generationProgress?.percent ?? 0}%
            </span>
          </div>
          <div className="w-full h-[3px] bg-villa-pink/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-villa-pink rounded-full transition-all duration-500 ease-out"
              style={{ width: `${generationProgress?.percent ?? 0}%` }}
            />
          </div>
          <span className={clsx('text-[8px] text-villa-dim normal-case tracking-normal', !generationProgress && 'opacity-0')}>
            {generationProgress?.label ?? '\u00A0'}
          </span>
        </div>
      </div>

      {showStart && (
        <Tooltip content="Begin the season. Each islander introduces themselves, then the show plays out automatically scene by scene." side="top">
          <button
            onClick={() => generateScene()}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg cursor-pointer leading-none"
          >
            <span className="inline-block w-0 h-0 border-l-[6px] border-l-current border-y-[4px] border-y-transparent" aria-hidden="true" />
            <span>start show</span>
          </button>
        </Tooltip>
      )}

      {showRetry && (
        <Tooltip content="The writers room hit an error. Try the last scene generation again." side="top">
          <button
            onClick={() => generateScene()}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border border-villa-love text-villa-love hover:bg-villa-love hover:text-villa-bg cursor-pointer leading-none"
          >
            <span>↻</span>
            <span>retry</span>
          </button>
        </Tooltip>
      )}

      {showNewSeason && (
        <>
          <Tooltip content="Reset the villa with a fresh cast configuration and a new season theme." side="top">
            <button
              onClick={startNewEpisode}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs uppercase tracking-widest border border-villa-sun text-villa-sun hover:bg-villa-sun hover:text-villa-bg cursor-pointer leading-none"
            >
              <span>★</span>
              <span>new season</span>
            </button>
          </Tooltip>
          <Tooltip content="Download season data as JSON for fine-tuning and reference." side="top">
            <button
              onClick={exportSeasonData}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua cursor-pointer leading-none"
            >
              export season
            </button>
          </Tooltip>
          <Tooltip content="Download RL agent training data (brains, rewards, memories)." side="top">
            <button
              onClick={exportRLData}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-aqua hover:text-villa-aqua cursor-pointer leading-none"
            >
              export RL
            </button>
          </Tooltip>
        </>
      )}

      <div className="flex-1" />

      {showPause && (
        <Tooltip content={isPaused ? 'Resume the show.' : 'Pause playback so you can read the dialogue at your own pace.'} side="top">
          <button
            onClick={togglePause}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1.5 text-[10px] uppercase border cursor-pointer leading-none',
              isPaused ? 'border-villa-sun text-villa-sun' : 'border-villa-aqua text-villa-aqua hover:bg-villa-aqua/10'
            )}
          >
            {isPaused ? (
              <>
                <span className="inline-block w-0 h-0 border-l-[6px] border-l-current border-y-[4px] border-y-transparent" aria-hidden="true" />
                <span>play</span>
              </>
            ) : (
              <>
                <span className="inline-flex gap-[2px]" aria-hidden="true">
                  <span className="inline-block w-[2px] h-[8px] bg-current" />
                  <span className="inline-block w-[2px] h-[8px] bg-current" />
                </span>
                <span>pause</span>
              </>
            )}
          </button>
        </Tooltip>
      )}

      <Tooltip content="Background 8 bit chiptune to set the villa mood." side="top">
        <button
          onClick={handleMusicClick}
          className={clsx(
            'inline-flex items-center px-2 py-1.5 text-[10px] uppercase border cursor-pointer leading-none',
            musicEnabled ? 'border-villa-sun text-villa-sun' : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
          )}
        >
          ♪ {musicEnabled ? 'on' : 'off'}
        </button>
      </Tooltip>

      <Tooltip content="Hide or show the help tooltips throughout the app." side="top">
        <button
          onClick={toggleTooltips}
          className={clsx(
            'inline-flex items-center px-2 py-1.5 text-[10px] uppercase border cursor-pointer leading-none',
            tooltipsEnabled ? 'border-villa-aqua text-villa-aqua' : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
          )}
        >
          ? {tooltipsEnabled ? 'on' : 'off'}
        </button>
      </Tooltip>

      <button
        onClick={onToggleCast}
        className="lg:hidden inline-flex items-center px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink leading-none"
      >
        cast
      </button>
      <button
        onClick={onToggleRelationships}
        className="lg:hidden inline-flex items-center px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink leading-none"
      >
        rels
      </button>
    </div>
  )
}
