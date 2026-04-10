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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentLineIndex])

  if (lines.length === 0) {
    return (
      <div className="border border-villa-dim/30 p-4 text-villa-dim text-xs italic">
        no dialogue yet, press [next scene] to start
      </div>
    )
  }

  const visible = lines.slice(0, currentLineIndex + 1)

  return (
    <div className="border border-villa-pink/30 bg-villa-bg-2/40 p-3 sm:p-4 space-y-2 overflow-y-auto scrollbar-thin">
      {visible.map((line, idx) => {
        const agent = cast.find((a) => a.id === line.agentId)
        if (!agent) return null
        return (
          <ChatBubble
            key={line.id}
            agent={agent}
            line={line}
            isCurrent={idx === currentLineIndex}
          />
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
