import { useState } from 'react'
import { PlusIcon } from 'lucide-react'

import { TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyCreatedBanner } from './key-created-banner'
import { KeyList } from './key-list'
import type { ApiKey } from './use-api-keys'

interface RaycastTabProps {
  keys: ApiKey[]
  isLoading: boolean
  isGenerating: boolean
  generatedKey: string | null
  onGenerateKey: (name: string) => Promise<string | null>
  onRevokeKey: (keyId: string) => void
  onClearGeneratedKey: () => void
}

export function RaycastTab({
  keys,
  isLoading,
  isGenerating,
  generatedKey,
  onGenerateKey,
  onRevokeKey,
  onClearGeneratedKey,
}: RaycastTabProps) {
  const [keyName, setKeyName] = useState('Raycast Extension')

  const handleGenerate = async () => {
    await onGenerateKey(keyName)
  }

  return (
    <TabsContent value='raycast' className='space-y-4 mt-4'>
      <p className='text-muted-foreground'>Save links with a keyboard shortcut from anywhere.</p>

      {generatedKey && (
        <KeyCreatedBanner generatedKey={generatedKey} onDone={onClearGeneratedKey} />
      )}

      {!generatedKey && (
        <>
          <div className='space-y-2 text-sm'>
            <p className='font-medium'>Setup Instructions:</p>
            <ol className='list-decimal list-inside space-y-1 text-muted-foreground'>
              <li>Install Cloudstash from the Raycast Store</li>
              <li>Generate an API key below</li>
              <li>Paste the key in extension preferences</li>
            </ol>
          </div>

          <div className='border-t pt-4 space-y-3'>
            <div className='flex gap-2'>
              <Input
                placeholder='Key name'
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className='flex-1'
              />
              <Button onClick={handleGenerate} disabled={isGenerating}>
                <PlusIcon className='h-4 w-4 mr-1' />
                {isGenerating ? 'Generating...' : 'Generate'}
              </Button>
            </div>
          </div>
        </>
      )}

      <div className='border-t pt-4'>
        <p className='text-sm font-medium mb-2'>Your API Keys</p>
        <KeyList keys={keys} isLoading={isLoading} onRevoke={onRevokeKey} />
      </div>
    </TabsContent>
  )
}
