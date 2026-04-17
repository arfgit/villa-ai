import { useState, useRef, useEffect, useLayoutEffect, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode, Ref } from 'react'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import { useVillaStore } from '@/store/useVillaStore'

interface Props {
  children: ReactElement
  content: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}

interface ChildProps {
  ref?: Ref<HTMLElement>
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  onFocus?: (e: React.FocusEvent) => void
  onBlur?: (e: React.FocusEvent) => void
}

interface Coords {
  top: number
  left: number
  measured: boolean
}

export default function Tooltip({ children, content, side = 'top' }: Props) {
  const enabled = useVillaStore((s) => s.ui.tooltipsEnabled)
  const [show, setShow] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) setShow(false)
  }, [enabled])

  useEffect(() => {
    if (!show) setCoords(null)
  }, [show])

  useLayoutEffect(() => {
    if (!show || !enabled || !triggerRef.current || !tooltipRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const tt = tooltipRef.current.getBoundingClientRect()
    const tooltipWidth = tt.width || 280
    const tooltipHeight = tt.height || 200
    const margin = 8
    const padding = 8

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

    const maxLeft = window.innerWidth - tooltipWidth - padding
    const maxTop = window.innerHeight - tooltipHeight - padding
    left = Math.max(padding, Math.min(maxLeft, left))
    top = Math.max(padding, Math.min(maxTop, top))

    if (!coords || coords.top !== top || coords.left !== left || !coords.measured) {
      setCoords({ top, left, measured: true })
    }
  }, [show, side, enabled, content, coords])

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
      {enabled && show && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className={clsx(
            'fixed z-[9999] pointer-events-none border border-villa-pink bg-villa-bg text-villa-ink px-2.5 py-2 text-[11px] leading-snug w-[280px] max-h-[80vh] overflow-y-auto shadow-2xl shadow-black/60',
            coords?.measured ? 'opacity-100 animate-villa-fadein' : 'opacity-0'
          )}
          style={{
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}
