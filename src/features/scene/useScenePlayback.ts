import { useEffect } from 'react'
import { useVillaStore } from '@/store/useVillaStore'

export function useScenePlayback() {
  const advanceLine = useVillaStore((s) => s.advanceLine)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const currentLineIndex = useVillaStore((s) => s.currentLineIndex)
  const autoPlay = useVillaStore((s) => s.ui.autoPlay)
  const lineDelayMs = useVillaStore((s) => s.ui.lineDelayMs)
  const scenes = useVillaStore((s) => s.episode.scenes)

  const scene = scenes.find((s) => s.id === currentSceneId)
  const total = scene?.dialogue.length ?? 0
  const isLast = currentLineIndex >= total - 1

  useEffect(() => {
    if (!autoPlay || isLast || !scene) return
    const t = setTimeout(() => advanceLine(), lineDelayMs)
    return () => clearTimeout(t)
  }, [autoPlay, currentLineIndex, isLast, scene, lineDelayMs, advanceLine])
}
