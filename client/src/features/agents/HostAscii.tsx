import clsx from 'clsx'
import type { Host } from '@/types'

interface Props {
  host: Host
  speaking?: boolean
}

export default function HostAscii({ host, speaking = false }: Props) {
  return (
    <div
      className={clsx(
        'ascii inline-block text-center text-xs leading-[1.1] transition-all duration-200',
        host.colorClass,
        speaking && 'animate-villa-bounce-talk'
      )}
    >
      <div className="text-sm">{host.emojiFace}</div>
      <div>{'\\o/'}</div>
      <div>{'/|\\'}</div>
      <div>{'/ \\'}</div>
      <div className="mt-0.5 text-[8px] uppercase tracking-wider text-villa-sun">
        HOST
      </div>
    </div>
  )
}
