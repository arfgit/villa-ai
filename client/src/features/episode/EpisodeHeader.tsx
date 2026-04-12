import { useEffect, useRef } from 'react'
import { useVillaStore } from '@/store/useVillaStore'
import { getSceneLabel } from '@/data/environments'
import clsx from 'clsx'

export default function EpisodeHeader() {
  const episode = useVillaStore((s) => s.episode)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const selectScene = useVillaStore((s) => s.selectScene)

  const scrollRef = useRef<HTMLDivElement>(null)
  const prevSceneIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!currentSceneId || !scrollRef.current) {
      prevSceneIdRef.current = currentSceneId
      return
    }
    // Only auto-scroll if the user was on the immediately preceding scene
    // (i.e. "following along"). If they clicked an older scene to re-read,
    // don't yank them to the new one.
    const scenes = episode.scenes
    const prevIdx = scenes.findIndex((s) => s.id === prevSceneIdRef.current)
    const curIdx = scenes.findIndex((s) => s.id === currentSceneId)
    const wasFollowingAlong = prevIdx >= 0 && curIdx === prevIdx + 1

    if (wasFollowingAlong) {
      const safeId = CSS.escape(currentSceneId)
      const btn = scrollRef.current.querySelector(
        `[data-scene-id="${safeId}"]`
      )
      btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }

    prevSceneIdRef.current = currentSceneId
  }, [currentSceneId, episode.scenes])

  return (
    <header className="border-b border-villa-pink/30 bg-villa-bg-2/60 backdrop-blur px-3 sm:px-4 py-2 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-villa-pink text-lg">♥</span>
        <span className="text-sm font-bold tracking-widest uppercase">VILLA AI</span>
      </div>
      <span className="text-villa-dim text-[10px] uppercase">Season {episode.number}</span>
      <div ref={scrollRef} className="flex-1 overflow-x-auto scrollbar-thin flex gap-1">
        {episode.scenes.map((scene, i) => {
          const recoupleOrdinal = scene.type === 'recouple'
            ? episode.scenes.slice(0, i + 1).filter((s) => s.type === 'recouple').length
            : 0
          const label = getSceneLabel(scene.type, recoupleOrdinal)
          return (
            <button
              key={scene.id}
              data-scene-id={scene.id}
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
