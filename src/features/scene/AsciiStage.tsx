import type { Agent, EmotionState, SceneType } from '@/types'
import { ENVIRONMENTS, SCENE_LABELS } from '@/data/environments'
import AgentAscii from '@/features/agents/AgentAscii'

interface Props {
  sceneType: SceneType
  participants: Agent[]
  speakingAgentId?: string
  emotions: EmotionState[]
}

export default function AsciiStage({ sceneType, participants, speakingAgentId, emotions }: Props) {
  const env = ENVIRONMENTS[sceneType]
  const label = SCENE_LABELS[sceneType]

  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? 'neutral'
  }

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2 flex items-center gap-2">
        <span>{label.emoji}</span>
        <span>{label.title}</span>
      </div>

      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
        <pre className="ascii text-villa-dim text-[10px] sm:text-xs animate-villa-shimmer inline-block">
          {env}
        </pre>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-around gap-3 sm:gap-6 min-h-[90px]">
        {participants.map((agent) => (
          <AgentAscii
            key={agent.id}
            agent={agent}
            emotion={getEmotion(agent.id)}
            size="md"
            highlighted={speakingAgentId === agent.id}
          />
        ))}
        {participants.length === 0 && (
          <div className="text-villa-dim text-xs italic">empty stage</div>
        )}
      </div>
    </div>
  )
}
