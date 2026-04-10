import clsx from 'clsx'
import { useVillaStore } from '@/store/useVillaStore'
import { SCENE_LABELS } from '@/data/environments'
import type { SceneType } from '@/types'
import Tooltip from '@/components/ui/Tooltip'

interface Props {
  onToggleCast: () => void
  onToggleRelationships: () => void
}

export default function BottomActionBar({ onToggleCast, onToggleRelationships }: Props) {
  const generateScene = useVillaStore((s) => s.generateScene)
  const isGenerating = useVillaStore((s) => s.isGenerating)
  const autoPlay = useVillaStore((s) => s.ui.autoPlay)
  const setAutoPlay = useVillaStore((s) => s.setAutoPlay)
  const tooltipsEnabled = useVillaStore((s) => s.ui.tooltipsEnabled)
  const toggleTooltips = useVillaStore((s) => s.toggleTooltips)
  const musicEnabled = useVillaStore((s) => s.ui.musicEnabled)
  const toggleMusic = useVillaStore((s) => s.toggleMusic)
  const sceneCount = useVillaStore((s) => s.episode.scenes.length)

  return (
    <div className="border-t border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <Tooltip content="Generates the next scene by calling Gemini. Each scene contains 6 to 10 dialogue lines plus relationship and emotion changes." side="top">
        <button
          onClick={() => generateScene()}
          disabled={isGenerating}
          className={clsx(
            'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-widest border cursor-pointer leading-none',
            'border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {isGenerating ? (
            <>
              <span className="animate-spin">◐</span>
              <span>generating</span>
            </>
          ) : sceneCount === 0 ? (
            <>
              <span className="text-[10px]">▶</span>
              <span>start show</span>
            </>
          ) : (
            <>
              <span className="text-[10px]">▶</span>
              <span>next scene</span>
            </>
          )}
        </button>
      </Tooltip>

      <Tooltip content="When on, scenes auto advance line by line and chain into the next scene. Off means you control the pace." side="top">
        <button
          onClick={() => setAutoPlay(!autoPlay)}
          className={clsx(
            'inline-flex items-center px-2 py-1.5 text-[10px] uppercase border cursor-pointer leading-none',
            autoPlay ? 'border-villa-sun text-villa-sun' : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
          )}
        >
          auto {autoPlay ? 'on' : 'off'}
        </button>
      </Tooltip>

      <div className="flex gap-1">
        {(['firepit', 'pool', 'recouple'] as SceneType[]).map((t) => (
          <Tooltip key={t} content={`Force the next scene to be a ${SCENE_LABELS[t].title}.`} side="top">
            <button
              onClick={() => generateScene(t)}
              disabled={isGenerating}
              className="inline-flex items-center justify-center px-2 py-1.5 text-[12px] border border-villa-dim/40 hover:border-villa-pink hover:text-villa-pink disabled:opacity-40 cursor-pointer leading-none"
            >
              {SCENE_LABELS[t].emoji}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="flex-1" />

      <Tooltip content="Background 8 bit chiptune to set the villa mood." side="top">
        <button
          onClick={toggleMusic}
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
