import { useState, useRef, useEffect, useCallback } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export function useModifierHold(delay = 1000) {
  const [showHints, setShowHints] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setShowHints(false)
  }, [])

  useHotkeys(
    '*',
    (e) => {
      const isModifier = e.metaKey || e.ctrlKey || e.shiftKey

      if (e.type === 'keydown' && isModifier && !timeoutRef.current) {
        timeoutRef.current = setTimeout(() => setShowHints(true), delay)
      } else if (e.type === 'keyup' && !isModifier) {
        reset()
      }
    },
    { keydown: true, keyup: true },
  )

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) reset()
    }

    window.addEventListener('blur', reset)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('blur', reset)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [reset])

  return showHints
}
