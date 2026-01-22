import { useState, useEffect } from 'react'
import {
  CopyIcon,
  Trash2Icon,
  PlusIcon,
  KeyIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { authClient } from '@/lib/auth'
import { Route } from '@/routes/__root'

interface ApiKey {
  id: string
  name: string | null
  createdAt: Date
  lastRequest: Date | null
}

interface ApiKeysModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ApiKeysModal({ open, onOpenChange }: ApiKeysModalProps) {
  const { auth } = Route.useRouteContext()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // New key generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [commandCopied, setCommandCopied] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)

  const fetchKeys = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await authClient.apiKey.list()
      if (result.error) {
        setError(result.error.message || 'Failed to fetch API keys')
        return
      }
      setKeys(result.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch API keys')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchKeys()
      // Reset generation state when modal opens
      setGeneratedKey(null)
      setNewKeyName('')
      setCopied(false)
      setCommandCopied(false)
      setKeyVisible(false)
    }
  }, [open])

  const handleGenerateKey = async () => {
    if (!auth.orgId) {
      setError('No organization selected')
      return
    }

    setIsGenerating(true)
    setError(null)
    try {
      const result = await authClient.apiKey.create({
        name: newKeyName || 'API Key',
        metadata: {
          orgId: auth.orgId,
        },
      })
      if (result.error) {
        setError(result.error.message || 'Failed to generate API key')
        return
      }
      if (result.data?.key) {
        setGeneratedKey(result.data.key)
        await fetchKeys() // Refresh the list
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate API key')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    try {
      const result = await authClient.apiKey.delete({ keyId })
      if (result.error) {
        setError(result.error.message || 'Failed to revoke API key')
        return
      }
      await fetchKeys() // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key')
    }
  }

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyCommand = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(`/connect ${generatedKey}`)
      setCommandCopied(true)
      setTimeout(() => setCommandCopied(false), 2000)
    }
  }

  const handleDone = () => {
    setGeneratedKey(null)
    setNewKeyName('')
  }

  // Show the "key generated" view
  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>Copy this key now. It won't be shown again.</DialogDescription>
          </DialogHeader>

          <Alert className='bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800'>
            <AlertTriangleIcon className='h-4 w-4 text-amber-600' />
            <AlertDescription className='text-amber-800 dark:text-amber-200'>
              Store this key securely. You won't be able to see it again.
            </AlertDescription>
          </Alert>

          <div className='flex items-center gap-2'>
            <code className='flex-1 min-w-0 bg-muted px-3 py-2 rounded text-xs font-mono break-all'>
              {keyVisible ? generatedKey : '••••••••'}
            </code>
            <Button variant='outline' size='icon' onClick={() => setKeyVisible(!keyVisible)}>
              {keyVisible ? <EyeOffIcon className='h-4 w-4' /> : <EyeIcon className='h-4 w-4' />}
            </Button>
            <Button variant='outline' size='icon' onClick={handleCopyKey}>
              <CopyIcon className='h-4 w-4' />
            </Button>
          </div>

          {copied && (
            <p className='text-sm text-green-600 dark:text-green-400'>Copied to clipboard!</p>
          )}

          <div className='text-xs text-muted-foreground'>
            Use this key with the Telegram bot:
            <div className='flex items-center gap-2 mt-1'>
              <code className='flex-1 min-w-0 bg-muted px-2 py-1 rounded break-all'>
                /connect {keyVisible ? generatedKey : '••••••••'}
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

          <DialogFooter>
            <Button onClick={handleDone}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>API Keys</DialogTitle>
          <DialogDescription>
            API keys allow external apps to add links to your workspace.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Key list */}
        <div className='space-y-2 max-h-48 overflow-y-auto'>
          {isLoading ? (
            <>
              <Skeleton className='h-14 w-full' />
              <Skeleton className='h-14 w-full' />
            </>
          ) : keys.length === 0 ? (
            <div className='text-center py-6 text-muted-foreground'>
              <KeyIcon className='h-8 w-8 mx-auto mb-2 opacity-50' />
              <p className='text-sm'>No API keys yet</p>
            </div>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className='flex items-center justify-between p-3 bg-muted/50 rounded-lg'
              >
                <div className='min-w-0 flex-1'>
                  <p className='font-medium text-sm truncate'>{key.name || 'Unnamed key'}</p>
                  <p className='text-xs text-muted-foreground'>
                    Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.lastRequest && (
                      <> · Last used {new Date(key.lastRequest).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  onClick={() => handleRevokeKey(key.id)}
                  className='text-destructive hover:text-destructive'
                >
                  <Trash2Icon className='h-4 w-4' />
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Generate new key */}
        <div className='border-t pt-4 space-y-3'>
          <div className='flex gap-2'>
            <Input
              placeholder='Key name (e.g., Telegram Bot)'
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className='flex-1'
            />
            <Button onClick={handleGenerateKey} disabled={isGenerating}>
              <PlusIcon className='h-4 w-4 mr-1' />
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
