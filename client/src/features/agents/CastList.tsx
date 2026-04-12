import clsx from 'clsx'
import type { Agent, EmotionState, Couple, SceneType, AgentBrain } from '@/types'
import AgentAscii from './AgentAscii'
import Tooltip from '@/components/ui/Tooltip'
import { SCENE_LABELS } from '@/data/environments'

interface Props {
  cast: Agent[]
  emotions: EmotionState[]
  couples: Couple[]
  eliminatedIds: string[]
  winnerCouple: Couple | null
  locations: Record<string, SceneType>
  currentSceneType?: SceneType
  brains: Record<string, AgentBrain>
}

export default function CastList({ cast, emotions, couples, eliminatedIds, winnerCouple, locations, currentSceneType, brains }: Props) {
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

          const location = locations[agent.id]
          const locationLabel = location ? SCENE_LABELS[location] : null
          const isOnStage = location !== undefined && location === currentSceneType
          const brain = brains[agent.id]
          const memCount = brain?.memories.length ?? 0
          const reflectionCount = brain?.memories.filter((m) => m.type === 'reflection').length ?? 0
          const recentMems = brain?.memories.slice(-4).reverse() ?? []
          const goal = brain?.goal?.trim()
          const policy = brain?.policy?.trim()
          const cumReward = brain?.cumulativeReward ?? 0
          const recentRewards = brain?.rewards.slice(-4).reverse() ?? []

          const tooltipContent = (
            <div className="space-y-1.5 max-w-[280px]">
              <div className="text-villa-pink font-bold text-[10px] uppercase tracking-wider">{agent.name}'s brain</div>
              <div className="text-villa-dim italic">{agent.bio}</div>
              <div className="flex items-center gap-2 border-t border-villa-dim/30 pt-1">
                <span className="text-villa-dim uppercase text-[8px] tracking-wider">reward</span>
                <span className={clsx('font-mono', cumReward > 0 ? 'text-villa-aqua' : cumReward < 0 ? 'text-villa-love' : 'text-villa-dim')}>
                  {cumReward >= 0 ? '+' : ''}{cumReward}
                </span>
              </div>
              {policy && (
                <div className="border-l-2 border-villa-aqua pl-1.5">
                  <span className="text-villa-aqua uppercase text-[8px] tracking-wider">strategy</span>
                  <div className="text-villa-ink">{policy}</div>
                </div>
              )}
              {goal && (
                <div className="border-l-2 border-villa-sun pl-1.5">
                  <span className="text-villa-sun uppercase text-[8px] tracking-wider">goal</span>
                  <div className="text-villa-ink">{goal}</div>
                </div>
              )}
              {recentRewards.length > 0 && (
                <div>
                  <div className="text-villa-dim uppercase text-[8px] tracking-wider mb-0.5">recent rewards</div>
                  <ul className="space-y-0.5">
                    {recentRewards.map((r) => (
                      <li key={r.id} className={clsx(r.amount >= 0 ? 'text-villa-aqua' : 'text-villa-love')}>
                        <span className="text-villa-dim">[s{r.sceneNumber}]</span>{' '}
                        {r.amount >= 0 ? '+' : ''}{r.amount}{' '}
                        <span className="text-villa-ink">{r.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recentMems.length > 0 ? (
                <div>
                  <div className="text-villa-aqua uppercase text-[8px] tracking-wider mb-0.5">recent memories ({memCount} total)</div>
                  <ul className="space-y-1">
                    {recentMems.map((m) => (
                      <li key={m.id} className={clsx(m.type === 'reflection' ? 'text-villa-sun' : 'text-villa-ink')}>
                        <span className="text-villa-dim">[s{m.sceneNumber} · {m.type === 'reflection' ? '✦' : '·'} i{m.importance}]</span>{' '}
                        {m.content}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="text-villa-dim">no memories formed yet</div>
              )}
              {eliminated && <div className="text-villa-love uppercase text-[8px]">eliminated</div>}
            </div>
          )

          return (
            <Tooltip key={agent.id} content={tooltipContent} side="right">
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
                      {locationLabel && (
                        <div className={clsx('text-[9px] mt-0.5', isOnStage ? 'text-villa-aqua' : 'text-villa-dim')}>
                          📍 {locationLabel.emoji} {locationLabel.title.toLowerCase()}
                          {isOnStage && <span className="ml-1 text-villa-sun">●</span>}
                        </div>
                      )}
                      {(memCount > 0 || brain) && (
                        <div className="text-[9px] mt-0.5 flex gap-2">
                          {memCount > 0 && (
                            <span className="text-villa-aqua">
                              🧠 {memCount}{reflectionCount > 0 && <span className="text-villa-sun"> · ✦{reflectionCount}</span>}
                            </span>
                          )}
                          {brain && (
                            <span className={clsx('font-mono', cumReward > 0 ? 'text-villa-aqua' : cumReward < 0 ? 'text-villa-love' : 'text-villa-dim')}>
                              {cumReward >= 0 ? '+' : ''}{cumReward}
                            </span>
                          )}
                        </div>
                      )}
                      {policy && (
                        <div className="text-[9px] text-villa-aqua mt-0.5 truncate" title={policy}>
                          ⚡ {policy}
                        </div>
                      )}
                      {goal && (
                        <div className="text-[9px] text-villa-sun mt-0.5 truncate" title={goal}>
                          ▸ {goal}
                        </div>
                      )}
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
