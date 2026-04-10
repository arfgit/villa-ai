import { useEffect, useRef } from 'react'
import type { Agent, DialogueLine } from '@/types'
import ChatBubble from './ChatBubble'

interface Props {
  lines: DialogueLine[]
  cast: Agent[]
  currentLineIndex: number
}

export default function ChatBubbleFeed({ lines, cast, currentLineIndex }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentLineIndex, lines.length])

  if (lines.length === 0) {
    return (
      <div className="border border-villa-dim/30 p-4 text-villa-dim text-xs italic">
        no dialogue yet, press [next scene] to start
      </div>
    )
  }

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4 space-y-2 overflow-y-auto scrollbar-thin">
      {lines.map((line, idx) => {
        const agent = cast.find((a) => a.id === line.agentId)
        if (!agent) return null
        const isCurrent = idx === currentLineIndex
        return (
          <div
            key={line.id}
            ref={isCurrent ? currentRef : undefined}
            className="animate-villa-fadein"
            style={{ animationDelay: `${idx * 30}ms` }}
          >
            <ChatBubble agent={agent} line={line} isCurrent={isCurrent} />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
