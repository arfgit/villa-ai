import clsx from 'clsx'
import type { Agent, EmotionState, Couple } from '@/types'
import AgentAscii from './AgentAscii'
import Tooltip from '@/components/ui/Tooltip'

interface Props {
  cast: Agent[]
  emotions: EmotionState[]
  couples: Couple[]
}

export default function CastList({ cast, emotions, couples }: Props) {
  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? 'neutral'
  }

  function getCouple(id: string): string | null {
    const c = couples.find((c) => c.a === id || c.b === id)
    if (!c) return null
    return c.a === id ? c.b : c.a
  }

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 h-full flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-3 flex items-center justify-between">
        <span>░ cast ░</span>
        <Tooltip content="The 6 villa contestants. Each has a distinct personality the AI sticks to. Their emoji face changes based on their current emotion." side="bottom">
          <span className="text-villa-dim hover:text-villa-pink cursor-help text-[9px]">[?]</span>
        </Tooltip>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pr-1">
        {cast.map((agent) => {
          const coupleId = getCouple(agent.id)
          const partner = coupleId ? cast.find((c) => c.id === coupleId) : null
          const emotion = getEmotion(agent.id)
          return (
            <Tooltip key={agent.id} content={`${agent.bio} Voice: ${agent.voice}.`} side="right">
              <div className="flex items-start gap-2 pb-2 border-b border-villa-dim/20 last:border-0 cursor-help w-full">
                <AgentAscii agent={agent} emotion={emotion} size="sm" />
                <div className="flex-1 min-w-0 text-left">
                  <div className={clsx('text-xs font-bold', agent.colorClass)}>{agent.name}</div>
                  <div className="text-[9px] text-villa-dim italic">{agent.archetype}</div>
                  <div className="text-[9px] text-villa-dim mt-0.5">feeling: {emotion}</div>
                  {partner && (
                    <div className="text-[9px] text-villa-pink mt-0.5">
                      💍 {partner.name}
                    </div>
                  )}
                </div>
              </div>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}
