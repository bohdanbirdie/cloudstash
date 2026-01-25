import { useState } from 'react'
import { ClockIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useAuth } from '@/lib/auth'
import type { ApiErrorResponse } from '@/types/api'

export function PendingApproval() {
  const { logout, refresh } = useAuth()
  const [code, setCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignOut = async () => {
    await logout()
    window.location.reload()
  }

  const handleRedeem = async () => {
    if (!code.trim()) return

    setIsRedeeming(true)
    setError(null)

    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = (await res.json()) as { success: boolean } | ApiErrorResponse

      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'Failed to redeem invite')
        return
      }

      await refresh()
    } catch {
      setError('Failed to redeem invite')
    } finally {
      setIsRedeeming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && code.trim() && !isRedeeming) {
      handleRedeem()
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-4 bg-muted/30'>
      <Card className='max-w-md'>
        <CardContent className='pt-6 text-center'>
          <ClockIcon className='mx-auto h-12 w-12 text-yellow-500 mb-4' />
          <h1 className='text-xl font-semibold mb-2'>Account Pending Approval</h1>
          <p className='text-muted-foreground mb-6'>
            Your account is waiting for admin approval. You'll be able to access the app once
            approved.
          </p>

          <div className='border-t pt-4 mt-4'>
            <p className='text-sm text-muted-foreground mb-3'>Have an invite code?</p>
            <div className='flex gap-2'>
              <Input
                placeholder='Enter code'
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                maxLength={8}
                className='font-mono text-center tracking-widest'
                disabled={isRedeeming}
              />
              <Button onClick={handleRedeem} disabled={!code.trim() || isRedeeming}>
                {isRedeeming ? <Spinner className='size-4' /> : 'Redeem'}
              </Button>
            </div>
            {error && <p className='text-sm text-red-500 mt-2'>{error}</p>}
          </div>

          <Button variant='outline' onClick={handleSignOut} className='mt-6'>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
