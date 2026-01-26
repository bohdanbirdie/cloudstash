import { Trash2Icon, KeyIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { ApiKey } from './use-api-keys'

interface KeyListProps {
  keys: ApiKey[]
  isLoading: boolean
  onRevoke: (keyId: string) => void
}

export function KeyList({ keys, isLoading, onRevoke }: KeyListProps) {
  if (isLoading) {
    return (
      <div className='space-y-2'>
        <Skeleton className='h-14 w-full' />
        <Skeleton className='h-14 w-full' />
      </div>
    )
  }

  if (keys.length === 0) {
    return (
      <div className='text-center py-6 text-muted-foreground'>
        <KeyIcon className='h-8 w-8 mx-auto mb-2 opacity-50' />
        <p className='text-sm'>No API keys yet</p>
      </div>
    )
  }

  return (
    <div className='space-y-2 max-h-48 overflow-y-auto'>
      {keys.map((key) => (
        <div key={key.id} className='flex items-center justify-between p-3 bg-muted/50 rounded-lg'>
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
            onClick={() => onRevoke(key.id)}
            className='text-destructive hover:text-destructive'
          >
            <Trash2Icon className='h-4 w-4' />
          </Button>
        </div>
      ))}
    </div>
  )
}
