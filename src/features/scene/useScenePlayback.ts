import { useEffect } from 'react'
import { useVillaStore } from '@/store/useVillaStore'

export function useScenePlayback() {
  const advanceLine = useVillaStore((s) => s.advanceLine)
  const generateScene = useVillaStore((s) => s.generateScene)
  const currentSceneId = useVillaStore((s) => s.currentSceneId)
  const currentLineIndex = useVillaStore((s) => s.currentLineIndex)
  const autoPlay = useVillaStore((s) => s.ui.autoPlay)
  const lineDelayMs = useVillaStore((s) => s.ui.lineDelayMs)
  const isGenerating = useVillaStore((s) => s.isGenerating)

  const totalLines = useVillaStore((s) => {
    const scene = s.episode.scenes.find((sc) => sc.id === s.currentSceneId)
    return scene?.dialogue.length ?? 0
  })

  useEffect(() => {
    if (!autoPlay || !currentSceneId || isGenerating || totalLines === 0) return

    const isLast = currentLineIndex >= totalLines - 1

    if (!isLast) {
      const t = setTimeout(() => advanceLine(), lineDelayMs)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => generateScene(), lineDelayMs * 2)
    return () => clearTimeout(t)
  }, [autoPlay, currentSceneId, currentLineIndex, totalLines, lineDelayMs, isGenerating, advanceLine, generateScene])
}
