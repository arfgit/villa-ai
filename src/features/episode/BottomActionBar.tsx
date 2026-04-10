import clsx from 'clsx'
import { useVillaStore } from '@/store/useVillaStore'
import { SCENE_LABELS } from '@/data/environments'
import type { SceneType } from '@/types'

interface Props {
  onToggleCast: () => void
  onToggleRelationships: () => void
}

export default function BottomActionBar({ onToggleCast, onToggleRelationships }: Props) {
  const generateScene = useVillaStore((s) => s.generateScene)
  const isGenerating = useVillaStore((s) => s.isGenerating)
  const autoPlay = useVillaStore((s) => s.ui.autoPlay)
  const setAutoPlay = useVillaStore((s) => s.setAutoPlay)
  const sceneCount = useVillaStore((s) => s.episode.scenes.length)

  return (
    <div className="border-t border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <button
        onClick={() => generateScene()}
        disabled={isGenerating}
        className={clsx(
          'px-3 py-1.5 text-xs uppercase tracking-widest border',
          'border-villa-pink text-villa-pink hover:bg-villa-pink hover:text-villa-bg',
          'disabled:opacity-40 disabled:cursor-not-allowed'
        )}
      >
        {isGenerating ? '[ generating... ]' : sceneCount === 0 ? '[ ▶ start show ]' : '[ ▶ next scene ]'}
      </button>

      <button
        onClick={() => setAutoPlay(!autoPlay)}
        className={clsx(
          'px-2 py-1.5 text-[10px] uppercase border',
          autoPlay ? 'border-villa-sun text-villa-sun' : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
        )}
      >
        auto {autoPlay ? 'on' : 'off'}
      </button>

      <div className="flex gap-1">
        {(['firepit', 'pool', 'recouple'] as SceneType[]).map((t) => (
          <button
            key={t}
            onClick={() => generateScene(t)}
            disabled={isGenerating}
            className="px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink disabled:opacity-40"
            title={`Generate ${SCENE_LABELS[t].title}`}
          >
            {SCENE_LABELS[t].emoji}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onToggleCast}
        className="lg:hidden px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink"
      >
        cast
      </button>
      <button
        onClick={onToggleRelationships}
        className="lg:hidden px-2 py-1.5 text-[10px] uppercase border border-villa-dim/40 text-villa-dim hover:border-villa-pink hover:text-villa-pink"
      >
        rels
      </button>
    </div>
  )
}
