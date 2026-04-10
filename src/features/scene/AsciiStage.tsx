import clsx from 'clsx'
import type { Agent, EmotionState, SceneType } from '@/types'
import { ENVIRONMENTS, SCENE_LABELS } from '@/data/environments'
import AgentAscii from '@/features/agents/AgentAscii'

interface Props {
  sceneType: SceneType
  participants: Agent[]
  speakingAgentId?: string
  targetAgentId?: string
  emotions: EmotionState[]
}

export default function AsciiStage({ sceneType, participants, speakingAgentId, targetAgentId, emotions }: Props) {
  const env = ENVIRONMENTS[sceneType]
  const label = SCENE_LABELS[sceneType]

  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? 'neutral'
  }

  const interacting: Agent[] = []
  const bystanders: Agent[] = []

  for (const agent of participants) {
    if (agent.id === speakingAgentId || agent.id === targetAgentId) {
      interacting.push(agent)
    } else {
      bystanders.push(agent)
    }
  }

  if (interacting.length > 0) {
    interacting.sort((a) => (a.id === speakingAgentId ? -1 : 1))
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

      <div className="mt-3 min-h-[110px] flex items-end justify-center relative">
        {interacting.length > 0 ? (
          <div className="flex items-end gap-4 sm:gap-8">
            {interacting.map((agent) => (
              <div
                key={agent.id}
                className={clsx(
                  'transition-all duration-500 ease-out',
                  agent.id === speakingAgentId && '-translate-y-1'
                )}
              >
                <AgentAscii
                  agent={agent}
                  emotion={getEmotion(agent.id)}
                  size="md"
                  highlighted={agent.id === speakingAgentId}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-end gap-3 sm:gap-6">
            {participants.map((agent) => (
              <AgentAscii
                key={agent.id}
                agent={agent}
                emotion={getEmotion(agent.id)}
                size="md"
                highlighted={false}
              />
            ))}
          </div>
        )}

        {bystanders.length > 0 && interacting.length > 0 && (
          <div className="absolute right-0 bottom-0 flex items-end gap-1.5 opacity-50">
            {bystanders.map((agent) => (
              <div key={agent.id} className="transition-all duration-500 scale-90">
                <AgentAscii
                  agent={agent}
                  emotion={getEmotion(agent.id)}
                  size="sm"
                  highlighted={false}
                />
              </div>
            ))}
          </div>
        )}

        {participants.length === 0 && (
          <div className="text-villa-dim text-xs italic">empty stage</div>
        )}
      </div>
    </div>
  )
}
