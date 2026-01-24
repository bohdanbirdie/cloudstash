import { ClockIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/lib/auth'

export function PendingApproval() {
  const { logout } = useAuth()

  const handleSignOut = async () => {
    await logout()
    window.location.reload()
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
          <Button variant='outline' onClick={handleSignOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
