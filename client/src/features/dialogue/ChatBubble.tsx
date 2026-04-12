import clsx from 'clsx'
import type { Agent, DialogueLine, Emotion } from '@/types'

interface Props {
  agent: Agent
  line: DialogueLine
  isCurrent: boolean
}

const EMOTION_EMOJI: Record<Emotion, string> = {
  happy: '😊',
  flirty: '😏',
  jealous: '😒',
  angry: '😡',
  sad: '😢',
  smug: '😎',
  anxious: '😰',
  bored: '🥱',
  shocked: '😳',
  neutral: '💬',
}

export default function ChatBubble({ agent, line, isCurrent }: Props) {
  return (
    <div className={clsx('flex gap-2 items-start transition-all', !isCurrent && 'opacity-75')}>
      <div className={clsx('text-xs uppercase tracking-wider shrink-0 w-12 text-right pt-1.5 flex flex-col items-end', agent.colorClass)}>
        <span>{agent.name}</span>
        <span className="text-sm leading-none mt-0.5">{EMOTION_EMOJI[line.emotion]}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx(
          'border px-3 py-1.5 inline-block max-w-full transition-colors',
          isCurrent ? 'border-villa-sun bg-villa-sun/5 shadow-[0_0_12px_rgba(255,179,71,0.15)]' : 'border-villa-dim/40 bg-villa-bg-2/30'
        )}>
          {line.action && (
            <div className="text-[10px] italic text-villa-dim mb-0.5">*{line.action}*</div>
          )}
          <div className="text-sm text-villa-ink whitespace-pre-wrap break-words">
            {line.text}
          </div>
        </div>
      </div>
    </div>
  )
}
