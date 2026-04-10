import clsx from 'clsx'
import type { Agent, DialogueLine } from '@/types'

interface Props {
  agent: Agent
  line: DialogueLine
  isCurrent: boolean
}

export default function ChatBubble({ agent, line, isCurrent }: Props) {
  return (
    <div className={clsx('flex gap-2 items-start transition-opacity', !isCurrent && 'opacity-50')}>
      <div className={clsx('text-xs uppercase tracking-wider shrink-0 w-12 text-right pt-1', agent.colorClass)}>
        {agent.name}
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx(
          'border px-3 py-1.5 inline-block max-w-full',
          isCurrent ? 'border-villa-sun bg-villa-bg-2' : 'border-villa-dim/40 bg-villa-bg-2/30'
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
