import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { Agent, Emotion, SceneType } from '@/types'

interface Props {
  agent: Agent
  emotion?: Emotion
  size?: 'sm' | 'md' | 'lg'
  highlighted?: boolean
  sceneType?: SceneType
  isWinner?: boolean
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

const EMOTION_BUBBLE: Record<Emotion, string> = {
  happy: '💛',
  flirty: '💕',
  jealous: '💢',
  angry: '🔥',
  sad: '💧',
  smug: '✨',
  anxious: '💭',
  bored: '💤',
  shocked: '⚡',
  neutral: '',
}

const EMOTION_POSES: Partial<Record<Emotion, string[]>> = {
  angry:   ['\\|/', '|X|', '\\|/', '>|<', '\\|/', '|X|', '>|<', '\\|/'],
  sad:     ['.|.', '.|.', './.', '.|.', '.\\.',  '.|.', './.', '.\\.' ],
  flirty:  ['~|~', '\\o/', '~|~', '<|>', '~|~', '\\o/', '<|>', '~|~'],
  happy:   ['\\o/', '|o|', '\\o/', '/o\\', '\\o/', '|o|', '/o\\', '\\o/'],
  jealous: ['|.|', '|.|', '|_|', '|.|', '|_|', '|.|', '|_|', '|.|'],
  shocked: ['\\|/', '!|!', '\\|/', '!|!', '\\|/', '!|!', '\\|/', '!|!'],
}

const IDLE_POSES =    ['\\|/', '\\o/', '|||', '/|\\', '|o|', '\\|/', '/o\\', '|||']
const TALKING_POSES = ['\\o/', '\\|/', '\\o/', '|o|', '/o\\', '\\o/', '|o|', '\\|/']

const GAME_POSES =   ['\\o/', '/o\\', '\\o/', '|o|', '/o\\', '\\o/', '|o|', '/o\\']
const WINNER_POSES = ['\\o/', '/o\\', '\\o/', '\\o/', '/o\\', '\\o/', '/o\\', '\\o/']

export default function AgentAscii({ agent, emotion = 'neutral', size = 'md', highlighted = false, sceneType, isWinner = false }: Props) {
  const face = EMOTION_FACE[emotion]
  const bubble = EMOTION_BUBBLE[emotion]
  const [poseIdx, setPoseIdx] = useState(0)

  const isGameScene = sceneType === 'minigame' || sceneType === 'challenge'
  const animSpeed = isGameScene ? 280 : highlighted ? 350 : 1100

  useEffect(() => {
    if (size === 'sm') return
    const t = setInterval(() => setPoseIdx((i) => (i + 1) % 8), animSpeed)
    return () => clearInterval(t)
  }, [highlighted, size, animSpeed])

  let poseSet: string[]
  if (isWinner) {
    poseSet = WINNER_POSES
  } else if (isGameScene) {
    poseSet = GAME_POSES
  } else if (highlighted) {
    poseSet = TALKING_POSES
  } else {
    poseSet = EMOTION_POSES[emotion] ?? IDLE_POSES
  }
  const pose = poseSet[poseIdx % poseSet.length]

  const showBubble = !highlighted && bubble && emotion !== 'neutral'

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
        'ascii inline-block text-center text-sm leading-[1.1] transition-transform duration-200 relative',
        highlighted && 'text-villa-sun scale-110',
        isWinner && 'text-villa-sun',
        !highlighted && !isWinner && agent.colorClass
      )}>
        {showBubble && (
          <div className="absolute -top-3 -right-2 text-[10px] animate-villa-fadein opacity-80">{bubble}</div>
        )}
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
      'ascii inline-block text-center text-xs leading-[1.1] transition-all duration-200 relative',
      isWinner && 'text-villa-sun animate-villa-bounce-talk',
      !isWinner && highlighted ? 'text-villa-sun animate-villa-bounce-talk' : !isWinner ? `${agent.colorClass} animate-villa-sway` : ''
    )}>
      {showBubble && (
        <div className="absolute -top-3 -right-1 text-[9px] animate-villa-fadein opacity-80">{bubble}</div>
      )}
      <div className={clsx('text-sm', highlighted && 'animate-pulse')}>{face}</div>
      <div>{pose}</div>
      <div>{'/ \\'}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wider">{agent.name}</div>
    </div>
  )
}
