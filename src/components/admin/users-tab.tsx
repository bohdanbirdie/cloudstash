import { UsersIcon, ClockIcon, CheckIcon } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TabsContent } from '@/components/ui/tabs'
import type { AdminUser } from '@/types/api'
import { UserRow } from './user-row'

interface UsersTabProps {
  users: AdminUser[]
  isLoading: boolean
  error: string | null
  pendingCount: number
  activeCount: number
  adminCount: number
}

export function UsersTab({
  users,
  isLoading,
  error,
  pendingCount,
  activeCount,
  adminCount,
}: UsersTabProps) {
  return (
    <TabsContent value='users' className='flex-1 flex flex-col min-h-0'>
      <div className='flex gap-4 text-xs mb-3'>
        <div className='flex items-center gap-1.5'>
          <UsersIcon className='h-4 w-4 text-muted-foreground' />
          <span className='font-medium'>{users.length}</span>
          <span className='text-muted-foreground'>total</span>
        </div>
        {pendingCount > 0 && (
          <div className='flex items-center gap-1.5'>
            <ClockIcon className='h-4 w-4 text-yellow-500' />
            <span className='font-medium'>{pendingCount}</span>
            <span className='text-muted-foreground'>pending</span>
          </div>
        )}
        <div className='flex items-center gap-1.5'>
          <CheckIcon className='h-4 w-4 text-green-500' />
          <span className='font-medium'>{activeCount}</span>
          <span className='text-muted-foreground'>active</span>
        </div>
      </div>

      {error && (
        <Alert variant='destructive' className='mb-3'>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className='flex-1 overflow-y-auto space-y-2 min-h-0'>
        {isLoading ? (
          <>
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
            <Skeleton className='h-16 w-full' />
          </>
        ) : users.length === 0 ? (
          <div className='text-center py-8 text-muted-foreground'>
            <UsersIcon className='h-8 w-8 mx-auto mb-2 opacity-50' />
            <p className='text-xs'>No users yet</p>
          </div>
        ) : (
          users.map((user) => <UserRow key={user.id} user={user} adminCount={adminCount} />)
        )}
      </div>
    </TabsContent>
  )
}
