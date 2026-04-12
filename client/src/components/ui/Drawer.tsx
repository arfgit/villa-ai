import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Drawer({ open, onClose, title, children }: Props) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      let id2 = 0
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(id1)
        if (id2) cancelAnimationFrame(id2)
      }
    } else {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!mounted) return null

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 z-40 lg:hidden bg-black transition-opacity duration-200',
          visible ? 'opacity-60' : 'opacity-0'
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          'fixed inset-x-0 bottom-0 z-50 lg:hidden',
          'border-t-2 border-villa-pink bg-villa-bg-2',
          'max-h-[80vh] flex flex-col',
          'transition-transform duration-220 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ transitionDuration: '220ms' }}
      >
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
