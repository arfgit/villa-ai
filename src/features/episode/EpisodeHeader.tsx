import { useVillaStore } from '@/store/useVillaStore'
import { SCENE_LABELS } from '@/data/environments'
import clsx from 'clsx'

export default function EpisodeHeader() {
  const episode = useVillaStore((s) => s.episode)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const selectScene = useVillaStore((s) => s.selectScene)

  return (
    <header className="border-b border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 sm:px-4 py-2 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-villa-pink text-lg">♥</span>
        <span className="text-sm font-bold tracking-widest uppercase">VILLA AI</span>
      </div>
      <span className="text-villa-dim text-[10px] uppercase">Ep {episode.number}</span>
      <div className="flex-1 overflow-x-auto scrollbar-thin flex gap-1">
        {episode.scenes.map((scene, i) => {
          const label = SCENE_LABELS[scene.type]
          return (
            <button
              key={scene.id}
              onClick={() => selectScene(scene.id)}
              className={clsx(
                'px-2 py-0.5 text-[10px] border whitespace-nowrap shrink-0',
                scene.id === currentSceneId
                  ? 'border-villa-pink text-villa-pink'
                  : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
              )}
            >
              {i + 1}. {label.emoji} {label.title}
            </button>
          )
        })}
      </div>
    </header>
  )
}
