import clsx from 'clsx'
import type { Agent, EmotionState, Couple } from '@/types'
import AgentAscii from './AgentAscii'
import Tooltip from '@/components/ui/Tooltip'

interface Props {
  cast: Agent[]
  emotions: EmotionState[]
  couples: Couple[]
  eliminatedIds: string[]
  winnerCouple: Couple | null
}

export default function CastList({ cast, emotions, couples, eliminatedIds, winnerCouple }: Props) {
  function getEmotion(id: string) {
    return emotions.find((e) => e.agentId === id)?.primary ?? 'neutral'
  }

  function getCouple(id: string): string | null {
    const c = couples.find((c) => c.a === id || c.b === id)
    if (!c) return null
    return c.a === id ? c.b : c.a
  }

  function isWinner(id: string): boolean {
    if (!winnerCouple) return false
    return winnerCouple.a === id || winnerCouple.b === id
  }

  const sorted = [...cast].sort((a, b) => {
    const aOut = eliminatedIds.includes(a.id)
    const bOut = eliminatedIds.includes(b.id)
    if (aOut !== bOut) return aOut ? 1 : -1
    return 0
  })

  const remaining = cast.length - eliminatedIds.length

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 h-full flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-3 flex items-center justify-between">
        <span>░ cast · {remaining}/{cast.length} ░</span>
        <Tooltip content="The villa contestants. Cast members left without a partner get eliminated. Last couple standing wins the season." side="bottom">
          <span className="text-villa-dim hover:text-villa-pink cursor-help text-[9px]">[?]</span>
        </Tooltip>
      </div>

      {winnerCouple && (
        <div className="mb-3 p-2 border border-villa-sun bg-villa-sun/10 text-center animate-villa-fadein">
          <div className="text-[9px] uppercase tracking-widest text-villa-sun mb-1">★ winners ★</div>
          <div className="text-xs">
            {cast.find((c) => c.id === winnerCouple.a)?.name} & {cast.find((c) => c.id === winnerCouple.b)?.name}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pr-1">
        {sorted.map((agent) => {
          const eliminated = eliminatedIds.includes(agent.id)
          const winner = isWinner(agent.id)
          const coupleId = eliminated ? null : getCouple(agent.id)
          const partner = coupleId ? cast.find((c) => c.id === coupleId) : null
          const emotion = eliminated ? 'sad' : getEmotion(agent.id)

          return (
            <Tooltip key={agent.id} content={`${agent.bio} Voice: ${agent.voice}.${eliminated ? ' Eliminated.' : ''}`} side="right">
              <div
                className={clsx(
                  'flex items-start gap-2 pb-2 border-b border-villa-dim/20 last:border-0 cursor-help w-full',
                  eliminated && 'opacity-40',
                  winner && 'bg-villa-sun/5 px-2 py-1 border border-villa-sun/40'
                )}
              >
                <AgentAscii agent={agent} emotion={emotion} size="sm" />
                <div className="flex-1 min-w-0 text-left">
                  <div className={clsx('text-xs font-bold flex items-center gap-1', agent.colorClass, eliminated && 'line-through')}>
                    <span>{agent.name}</span>
                    {winner && <span className="text-villa-sun text-[9px]">★</span>}
                  </div>
                  <div className="text-[9px] text-villa-dim italic">{agent.archetype}</div>
                  {eliminated ? (
                    <div className="text-[9px] text-villa-love mt-0.5">✗ dumped from villa</div>
                  ) : (
                    <>
                      <div className="text-[9px] text-villa-dim mt-0.5">feeling: {emotion}</div>
                      {partner && (
                        <div className="text-[9px] text-villa-pink mt-0.5">
                          💍 {partner.name}
                        </div>
                      )}
                    </>
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
