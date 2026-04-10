import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { Agent, Emotion } from '@/types'

interface Props {
  agent: Agent
  emotion?: Emotion
  size?: 'sm' | 'md' | 'lg'
  highlighted?: boolean
}

const EMOTION_FACE: Record<Emotion, string> = {
  happy: '😊',
  flirty: '😏',
  jealous: '😒',
  angry: '😡',
  sad: '😢',
  smug: '😎',
  anxious: '😰',
  bored: '🥱',
  shocked: '😳',
  neutral: '😐',
}

const POSES = ['\\|/', '\\o/', '|||', '/|\\']
const HIGHLIGHT_POSES = ['\\o/', '\\|/', '\\o/', '|o|']

export default function AgentAscii({ agent, emotion = 'neutral', size = 'md', highlighted = false }: Props) {
  const face = EMOTION_FACE[emotion]
  const [poseIdx, setPoseIdx] = useState(0)

  useEffect(() => {
    if (size === 'sm') return
    const interval = highlighted ? 320 : 1100
    const t = setInterval(() => setPoseIdx((i) => (i + 1) % 4), interval)
    return () => clearInterval(t)
  }, [highlighted, size])

  const pose = highlighted
    ? HIGHLIGHT_POSES[poseIdx % HIGHLIGHT_POSES.length]
    : POSES[poseIdx % POSES.length]

  if (size === 'sm') {
    return (
      <div className={clsx('ascii inline-block text-center text-[10px] leading-[1.1]', highlighted && 'text-villa-sun', !highlighted && agent.colorClass)}>
        <div>{face}</div>
        <div>{'/|\\'}</div>
        <div>{'/ \\'}</div>
      </div>
    )
  }

  if (size === 'lg') {
    return (
      <div className={clsx(
        'ascii inline-block text-center text-sm leading-[1.1] transition-transform duration-200',
        highlighted && 'text-villa-sun scale-110',
        !highlighted && agent.colorClass
      )}>
        <div>{agent.hairAscii}</div>
        <div className={clsx('text-base', highlighted && 'animate-pulse')}>{face}</div>
        <div>{pose}</div>
        <div>{' | '}</div>
        <div>{'/ \\'}</div>
        <div className="mt-1 text-[10px] tracking-widest uppercase">{agent.name}</div>
      </div>
    )
  }

  return (
    <div className={clsx(
      'ascii inline-block text-center text-xs leading-[1.1] transition-all duration-200',
      highlighted ? 'text-villa-sun animate-villa-bounce-talk' : `${agent.colorClass} animate-villa-sway`
    )}>
      <div className={clsx('text-sm', highlighted && 'animate-pulse')}>{face}</div>
      <div>{pose}</div>
      <div>{'/ \\'}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider">{agent.name}</div>
    </div>
  )
}
