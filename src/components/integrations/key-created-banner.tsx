import { useState } from 'react'
import {
  CopyIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface KeyCreatedBannerProps {
  generatedKey: string
  helperCommand?: string
  helperLabel?: string
  onDone: () => void
}

export function KeyCreatedBanner({
  generatedKey,
  helperCommand,
  helperLabel,
  onDone,
}: KeyCreatedBannerProps) {
  const [keyVisible, setKeyVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)

  const handleCopyKey = async () => {
    await navigator.clipboard.writeText(generatedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyCommand = async () => {
    if (helperCommand) {
      await navigator.clipboard.writeText(helperCommand)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    }
  }

  return (
    <div className='space-y-3 p-4 border rounded-lg bg-card'>
      <Alert className='bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'>
        <AlertTriangleIcon className='h-4 w-4 text-amber-600' />
        <AlertDescription className='text-amber-800 dark:text-amber-200'>
          Copy this key now. It won't be shown again.
        </AlertDescription>
      </Alert>

      <div className='flex items-center gap-2'>
        <code className='flex-1 min-w-0 bg-muted px-3 py-2 rounded text-xs font-mono break-all'>
          {keyVisible ? generatedKey : '••••••••••••••••'}
        </code>
        <Button variant='outline' size='icon' onClick={() => setKeyVisible(!keyVisible)}>
          {keyVisible ? <EyeOffIcon className='h-4 w-4' /> : <EyeIcon className='h-4 w-4' />}
        </Button>
        <Button variant='outline' size='icon' onClick={handleCopyKey}>
          {copied ? (
            <CheckIcon className='h-4 w-4 text-green-500' />
          ) : (
            <CopyIcon className='h-4 w-4' />
          )}
        </Button>
      </div>

      {helperCommand && (
        <div className='text-xs text-muted-foreground'>
          {helperLabel}
          <div className='flex items-center gap-2 mt-1'>
            <code className='flex-1 min-w-0 bg-muted px-2 py-1 rounded break-all'>
              {helperCommand.replace(generatedKey, keyVisible ? generatedKey : '••••••••')}
            </code>
            <Button variant='outline' size='icon-sm' onClick={handleCopyCommand}>
              {commandCopied ? (
                <CheckIcon className='h-3 w-3 text-green-500' />
              ) : (
                <CopyIcon className='h-3 w-3' />
              )}
            </Button>
          </div>
        </div>
      )}

      <Button onClick={onDone} className='w-full'>
        Done
      </Button>
    </div>
  )
}
