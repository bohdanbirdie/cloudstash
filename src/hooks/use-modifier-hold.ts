import { useState, useEffect } from 'react'

export function useModifierHold(delay = 1000) {
  const [showHints, setShowHints] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        timeoutId = setTimeout(() => setShowHints(true), delay)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        if (timeoutId) clearTimeout(timeoutId)
        setShowHints(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [delay])

  return showHints
}
