import clsx from 'clsx'
import type { Agent, Relationship, RelationshipMetric } from '@/types'

interface Props {
  cast: Agent[]
  relationships: Relationship[]
  metric: RelationshipMetric
  onMetricChange: (m: RelationshipMetric) => void
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

export default function RelationshipMatrix({ cast, relationships, metric, onMetricChange }: Props) {
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
      <div className="text-[10px] uppercase tracking-widest text-villa-pink/70 mb-2">
        ░ relationships ░
      </div>

      <div className="flex gap-1 mb-3">
        {(Object.keys(METRIC_LABELS) as RelationshipMetric[]).map((m) => (
          <button
            key={m}
            onClick={() => onMetricChange(m)}
            className={clsx(
              'flex-1 px-1 py-1 text-[9px] uppercase border',
              metric === m
                ? `border-villa-pink ${METRIC_COLORS[m]}`
                : 'border-villa-dim/40 text-villa-dim hover:border-villa-dim'
            )}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="overflow-auto scrollbar-thin flex-1">
        <table className="text-[9px] w-full">
          <thead>
            <tr>
              <th className="p-1"></th>
              {cast.map((c) => (
                <th key={c.id} className={clsx('p-1 text-center', c.colorClass)}>
                  {c.name.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cast.map((from) => (
              <tr key={from.id}>
                <td className={clsx('p-1', from.colorClass)}>{from.name.slice(0, 3)}</td>
                {cast.map((to) => {
                  if (from.id === to.id) {
                    return <td key={to.id} className="p-1 text-center text-villa-dim">·</td>
                  }
                  const value = getValue(from.id, to.id)
                  return (
                    <td key={to.id} className={clsx('p-1 text-center text-villa-ink/80', bgIntensity(value))}>
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
