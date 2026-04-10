import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useVillaStore } from '@/store/useVillaStore'

interface Props {
  children: ReactNode
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export default function Tooltip({ children, content, side = 'top' }: Props) {
  const enabled = useVillaStore((s) => s.ui.tooltipsEnabled)
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!show || !enabled || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const tooltipWidth = 200
    const tooltipHeight = 60
    const margin = 8

    let top = 0
    let left = 0

    if (side === 'top') {
      top = rect.top - tooltipHeight - margin
      left = rect.left + rect.width / 2 - tooltipWidth / 2
    } else if (side === 'bottom') {
      top = rect.bottom + margin
      left = rect.left + rect.width / 2 - tooltipWidth / 2
    } else if (side === 'left') {
      top = rect.top + rect.height / 2 - tooltipHeight / 2
      left = rect.left - tooltipWidth - margin
    } else {
      top = rect.top + rect.height / 2 - tooltipHeight / 2
      left = rect.right + margin
    }

    const padding = 8
    left = Math.max(padding, Math.min(window.innerWidth - tooltipWidth - padding, left))
    top = Math.max(padding, Math.min(window.innerHeight - tooltipHeight - padding, top))

    setCoords({ top, left })
  }, [show, side, enabled])

  return (
    <span
      ref={triggerRef}
      className="contents"
      onMouseEnter={() => enabled && setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => enabled && setShow(true)}
      onBlur={() => setShow(false)}
    >
      {children}
      {enabled && show && coords && createPortal(
        <div
          role="tooltip"
          className="fixed z-[9999] pointer-events-none border border-villa-pink bg-villa-bg text-villa-ink px-2.5 py-2 text-[11px] leading-snug w-[200px] shadow-2xl shadow-black/60 animate-villa-fadein"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body
      )}
    </span>
  )
}
