import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { ViewerMessage } from '@/types'

interface Props {
  messages: ViewerMessage[]
}

const SENTIMENT_COLORS: Record<ViewerMessage['sentiment'], string> = {
  positive: 'text-villa-aqua',
  negative: 'text-villa-love',
  neutral: 'text-villa-dim',
  chaotic: 'text-villa-sun',
}

export default function ViewerChat({ messages }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  return (
    <div className="h-full flex flex-col border border-villa-pink/20 bg-villa-bg/80">
      <div className="px-2 py-1 border-b border-villa-pink/20 flex items-center gap-1">
        <span className="text-[9px] uppercase tracking-widest text-villa-pink">live chat</span>
        <span className="text-[8px] text-villa-dim">({messages.length})</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1 space-y-0.5">
        {messages.length === 0 ? (
          <div className="text-[9px] text-villa-dim/40 italic py-2">waiting for the show to start...</div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={msg.id}
              className="text-[10px] leading-tight animate-villa-fadein"
              style={{ animationDelay: `${(i % 8) * 100}ms` }}
            >
              <span className={clsx('font-bold', SENTIMENT_COLORS[msg.sentiment])}>
                {msg.username}
              </span>
              <span className="text-villa-ink/80">: {msg.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
