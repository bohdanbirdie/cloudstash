import { useState, useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScrollableContentProps {
  children: ReactNode
  className?: string
  maxHeightClass?: string
  fadeFromClass?: string
}

export function ScrollableContent({
  children,
  className,
  maxHeightClass = 'max-h-48',
  fadeFromClass = 'from-background',
}: ScrollableContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const checkScroll = () => {
      const hasOverflow = container.scrollHeight > container.clientHeight
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 1

      setCanScroll(hasOverflow)
      setIsAtBottom(atBottom)
    }

    checkScroll()

    // Recheck on resize
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    container.addEventListener('scroll', checkScroll)

    return () => {
      resizeObserver.disconnect()
      container.removeEventListener('scroll', checkScroll)
    }
  }, [children])

  return (
    <div className='relative'>
      <div
        ref={containerRef}
        className={cn(
          maxHeightClass,
          // Always show scrollbar when content overflows
          canScroll ? 'overflow-y-scroll' : 'overflow-y-auto',
          className,
        )}
      >
        {children}
      </div>

      {canScroll && !isAtBottom && (
        <div
          className={cn(
            'absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t to-transparent pointer-events-none',
            fadeFromClass,
          )}
        />
      )}
    </div>
  )
}
