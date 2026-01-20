import { useState, useRef } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

export function useModifierHold(delay = 1000) {
  const [showHints, setShowHints] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useHotkeys(
    '*',
    (e) => {
      const isModifier = e.metaKey || e.ctrlKey || e.shiftKey

      if (e.type === 'keydown' && isModifier && !timeoutRef.current) {
        timeoutRef.current = setTimeout(() => setShowHints(true), delay)
      } else if (e.type === 'keyup' && !isModifier) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setShowHints(false)
      }
    },
    { keydown: true, keyup: true },
  )

  return showHints
}
