import clsx from 'clsx'
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

export default function AgentAscii({ agent, emotion = 'neutral', size = 'md', highlighted = false }: Props) {
  const face = EMOTION_FACE[emotion]

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
      <div className={clsx('ascii inline-block text-center text-sm leading-[1.1]', highlighted && 'text-villa-sun animate-pulse', !highlighted && agent.colorClass)}>
        <div>{agent.hairAscii}</div>
        <div>{face}</div>
        <div>{'\\|/'}</div>
        <div>{' | '}</div>
        <div>{'/ \\'}</div>
        <div className="mt-1 text-[10px] tracking-widest uppercase">{agent.name}</div>
      </div>
    )
  }

  return (
    <div className={clsx('ascii inline-block text-center text-xs leading-[1.1]', highlighted && 'text-villa-sun', !highlighted && agent.colorClass)}>
      <div>{face}</div>
      <div>{'\\|/'}</div>
      <div>{'/ \\'}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider">{agent.name}</div>
    </div>
  )
}
