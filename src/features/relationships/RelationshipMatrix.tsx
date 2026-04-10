import clsx from 'clsx'
import type { Agent, Relationship, RelationshipMetric } from '@/types'
import Tooltip from '@/components/ui/Tooltip'

interface Props {
  cast: Agent[]
  relationships: Relationship[]
  metric: RelationshipMetric
  onMetricChange: (m: RelationshipMetric) => void
  eliminatedIds?: string[]
}

const METRIC_LABELS: Record<RelationshipMetric, string> = {
  trust: 'TRUST',
  attraction: 'ATTRACTION',
  jealousy: 'JEALOUSY',
}

const METRIC_COLORS: Record<RelationshipMetric, string> = {
  trust: 'text-villa-trust',
  attraction: 'text-villa-pink',
  jealousy: 'text-villa-jealous',
}

const METRIC_TIPS: Record<RelationshipMetric, string> = {
  trust: 'How much one islander trusts the other (0-100). Goes up when they confide or back each other up. Drops on betrayal or lies.',
  attraction: 'Romantic interest one feels toward the other (0-100). Increases through flirting and shared moments. Drops when ignored or rejected.',
  jealousy: 'How threatened one feels by the other (0-100). Spikes when their crush flirts with someone else. Cools down with reassurance.',
}

export default function RelationshipMatrix({ cast, relationships, metric, onMetricChange, eliminatedIds = [] }: Props) {
  const activeCast = cast.filter((c) => !eliminatedIds.includes(c.id))
  const displayCast = activeCast
  function getValue(fromId: string, toId: string): number {
    const r = relationships.find((r) => r.fromId === fromId && r.toId === toId)
    if (!r) return 0
    return r[metric]
  }

  function bgIntensity(value: number): string {
    if (value >= 75) return 'bg-villa-pink/40'
    if (value >= 60) return 'bg-villa-pink/25'
    if (value >= 40) return 'bg-villa-pink/10'
    if (value >= 20) return 'bg-villa-dim/20'
    return ''
  }

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 h-full flex flex-col">
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2 flex items-center justify-between">
        <span>░ relationships ░</span>
        <Tooltip content="Each cell shows how the row islander feels about the column islander on the selected metric. Updates after every scene." side="bottom">
          <span className="text-villa-dim hover:text-villa-pink cursor-help text-[9px]">[?]</span>
        </Tooltip>
      </div>

      <div className="flex gap-1 mb-3">
        {(Object.keys(METRIC_LABELS) as RelationshipMetric[]).map((m) => (
          <Tooltip key={m} content={METRIC_TIPS[m]} side="bottom">
            <button
              onClick={() => onMetricChange(m)}
              className={clsx(
                'w-full px-1 py-1 text-[9px] uppercase border cursor-pointer',
                metric === m
                  ? `border-villa-pink ${METRIC_COLORS[m]}`
                  : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
              )}
            >
              {METRIC_LABELS[m]}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="overflow-auto scrollbar-thin flex-1">
        <table className="text-[9px] w-full">
          <thead>
            <tr>
              <th className="p-1"></th>
              {displayCast.map((c) => (
                <th key={c.id} className={clsx('p-1 text-center font-normal', c.colorClass)}>
                  {c.name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayCast.map((from) => (
              <tr key={from.id}>
                <td className={clsx('p-1 text-left', from.colorClass)}>{from.name.slice(0, 3)}</td>
                {displayCast.map((to) => {
                  if (from.id === to.id) {
                    return <td key={to.id} className="p-1 text-center text-villa-dim">·</td>
                  }
                  const value = getValue(from.id, to.id)
                  return (
                    <td key={to.id} className={clsx('p-1 text-center text-villa-ink/80 tabular-nums', bgIntensity(value))}>
                      {value}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[8px] text-villa-dim text-center">
        rows = from, columns = to
      </div>
    </div>
  )
}
