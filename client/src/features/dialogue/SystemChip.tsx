import clsx from 'clsx'
import type { SystemEvent } from '@villa-ai/shared'

interface Props {
  event: SystemEvent
}

const EVENT_EMOJI: Record<string, string> = {
  trust_change: '🤝',
  attraction_change: '💕',
  jealousy_spike: '😡',
  couple_formed: '💍',
  couple_broken: '💔',
}

export default function SystemChip({ event }: Props) {
  const emoji = EVENT_EMOJI[event.type] ?? '⚡'
  const isPositive = (event.delta ?? 0) > 0
  const isNegative = (event.delta ?? 0) < 0

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] border tracking-wide uppercase',
      isPositive && 'border-villa-trust/60 text-villa-trust',
      isNegative && 'border-villa-love/60 text-villa-love',
      !isPositive && !isNegative && 'border-villa-dim/60 text-villa-ink/80'
    )}>
      <span>{emoji}</span>
      <span>{event.label}</span>
    </span>
  )
}
