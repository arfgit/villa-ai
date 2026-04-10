import type { ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Drawer({ open, onClose, title, children }: Props) {
  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />
      <div className={clsx(
        'fixed inset-x-0 bottom-0 z-50 lg:hidden',
        'border-t-2 border-villa-pink bg-villa-bg-2',
        'max-h-[80vh] flex flex-col'
      )}>
        <div className="flex items-center justify-between p-3 border-b border-villa-pink/30">
          <span className="text-[10px] uppercase tracking-widest text-villa-pink">░ {title} ░</span>
          <button onClick={onClose} className="text-villa-dim hover:text-villa-pink text-xs">[close]</button>
        </div>
        <div className="overflow-y-auto scrollbar-thin flex-1 p-3">
          {children}
        </div>
      </div>
    </>
  )
}
