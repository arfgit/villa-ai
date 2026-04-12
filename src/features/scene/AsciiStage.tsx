import { useMemo } from 'react'
import clsx from 'clsx'
import type { Agent, EmotionState, SceneType, Host } from '@/types'
import { ENVIRONMENTS, getSceneLabel } from '@/data/environments'
import AgentAscii from '@/features/agents/AgentAscii'
import HostAscii from '@/features/agents/HostAscii'

interface Props {
  sceneType: SceneType
  participants: Agent[]
  speakingAgentId?: string
  targetAgentId?: string
  emotions: EmotionState[]
  sceneNumber: number
  totalScenes?: number
  host?: Host
  recoupleOrdinal?: number
}

export default function AsciiStage({ sceneType, participants, speakingAgentId, targetAgentId, emotions, sceneNumber, host, recoupleOrdinal }: Props) {
  const env = ENVIRONMENTS[sceneType]
  const label = getSceneLabel(sceneType, recoupleOrdinal)

  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? 'neutral'
  }

  const basePositions = useMemo(() => {
    const result: Record<string, { left: number; bottom: number }> = {}
    const n = participants.length
    if (n === 0) return result
    if (n === 1) {
      result[participants[0]!.id] = { left: 50, bottom: 8 }
      return result
    }
    participants.forEach((agent, idx) => {
      const t = idx / (n - 1)
      const left = 12 + t * 76
      const arc = Math.sin(t * Math.PI) * 6
      result[agent.id] = { left, bottom: 4 + arc }
    })
    return result
  }, [participants])

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{label.emoji}</span>
          <span>{label.title}</span>
        </div>
        <span className="text-villa-dim">ep {sceneNumber}</span>
      </div>

      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1 max-h-[140px] sm:max-h-[160px]">
        <pre className="ascii text-villa-dim text-[9px] sm:text-[11px] leading-tight animate-villa-shimmer inline-block">
          {env}
        </pre>
      </div>

      <div
        className={clsx(
          'mt-2 relative w-full',
          host ? 'h-[160px] sm:h-[170px]' : 'h-[120px] sm:h-[130px]'
        )}
      >
        {host && (
          <div
            className="absolute left-1/2 top-0 z-30"
            style={{ transform: 'translateX(-50%)' }}
          >
            <HostAscii host={host} speaking={speakingAgentId === host.id} />
          </div>
        )}
        {participants.map((agent) => {
          const base = basePositions[agent.id] ?? { left: 50, bottom: 4 }
          const isSpeaking = agent.id === speakingAgentId
          const isTarget = agent.id === targetAgentId

          const speakerBoost = isSpeaking ? 10 : 0
          const targetBoost = isTarget ? 4 : 0
          const speakerBase = isSpeaking || isTarget ? base.bottom + speakerBoost + targetBoost : base.bottom

          let leanLeft = base.left
          if (isTarget && speakingAgentId) {
            const speakerPos = basePositions[speakingAgentId]
            if (speakerPos) {
              leanLeft = base.left + (speakerPos.left - base.left) * 0.12
            }
          }

          return (
            <div
              key={agent.id}
              className={clsx(
                'absolute transition-all duration-700 ease-in-out',
                isSpeaking && 'z-20',
                isTarget && 'z-10'
              )}
              style={{
                left: `${leanLeft}%`,
                bottom: `${speakerBase}px`,
                transform: 'translateX(-50%)',
              }}
            >
              <AgentAscii
                agent={agent}
                emotion={getEmotion(agent.id)}
                size="md"
                highlighted={isSpeaking}
                sceneType={sceneType}
              />
            </div>
          )
        })}
        {participants.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-villa-dim text-xs italic">empty stage</div>
        )}
      </div>
    </div>
  )
}
