import { useState, useRef, useEffect, cloneElement, isValidElement } from 'react'
import type { ReactElement, Ref } from 'react'
import { createPortal } from 'react-dom'
import { useVillaStore } from '@/store/useVillaStore'

interface Props {
  children: ReactElement
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

interface ChildProps {
  ref?: Ref<HTMLElement>
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  onFocus?: (e: React.FocusEvent) => void
  onBlur?: (e: React.FocusEvent) => void
}

export default function Tooltip({ children, content, side = 'top' }: Props) {
  const enabled = useVillaStore((s) => s.ui.tooltipsEnabled)
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!enabled) setShow(false)
  }, [enabled])

  useEffect(() => {
    if (!show || !enabled || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    const tooltipWidth = 220
    const tooltipHeight = 64
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

  if (!isValidElement(children)) return <>{children}</>

  const childProps = (children.props ?? {}) as ChildProps

  const cloned = cloneElement(children as ReactElement<ChildProps>, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent) => {
      if (enabled) setShow(true)
      childProps.onMouseEnter?.(e)
    },
    onMouseLeave: (e: React.MouseEvent) => {
      setShow(false)
      childProps.onMouseLeave?.(e)
    },
    onFocus: (e: React.FocusEvent) => {
      if (enabled) setShow(true)
      childProps.onFocus?.(e)
    },
    onBlur: (e: React.FocusEvent) => {
      setShow(false)
      childProps.onBlur?.(e)
    },
  })

  return (
    <>
      {cloned}
      {enabled && show && coords && createPortal(
        <div
          role="tooltip"
          className="fixed z-[9999] pointer-events-none border border-villa-pink bg-villa-bg text-villa-ink px-2.5 py-2 text-[11px] leading-snug w-[220px] shadow-2xl shadow-black/60 animate-villa-fadein"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
