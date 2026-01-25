import {
  CheckIcon,
  XIcon,
  BanIcon,
  ShieldIcon,
  ShieldOffIcon,
  UsersIcon,
  ClockIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { TabsContent } from '@/components/ui/tabs'
import type { AdminUser } from '@/types/api'
import { getUserStatus, type ConfirmAction } from './use-users-admin'

interface UsersTabProps {
  users: AdminUser[]
  isLoading: boolean
  error: string | null
  actionLoading: string | null
  pendingCount: number
  activeCount: number
  adminCount: number
  onApprove: (userId: string) => void
  onReject: (userId: string) => void
  onBan: (userId: string) => void
  onUnban: (userId: string) => void
  onSetConfirmAction: (action: ConfirmAction) => void
}

export function UsersTab({
  users,
  isLoading,
  error,
  actionLoading,
  pendingCount,
  activeCount,
  adminCount,
  onApprove,
  onReject,
  onBan,
  onUnban,
  onSetConfirmAction,
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
          users.map((user) => {
            const status = getUserStatus(user)
            const isActionLoading = actionLoading === user.id
            return (
              <div
                key={user.id}
                className='flex items-center justify-between p-3 bg-muted/50 rounded-sm gap-3'
              >
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium text-xs truncate'>{user.name}</span>
                    {user.role === 'admin' && <Badge variant='secondary'>Admin</Badge>}
                    {status === 'pending' && (
                      <Badge
                        variant='outline'
                        className='bg-yellow-50 text-yellow-700 border-yellow-200'
                      >
                        Pending
                      </Badge>
                    )}
                    {status === 'banned' && (
                      <Badge variant='outline' className='bg-red-50 text-red-700 border-red-200'>
                        Banned
                      </Badge>
                    )}
                  </div>
                  <p className='text-xs text-muted-foreground truncate'>{user.email}</p>
                </div>

                <div className='flex gap-1 shrink-0'>
                  {status === 'pending' && (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size='icon-sm'
                              variant='outline'
                              onClick={() => onApprove(user.id)}
                              disabled={isActionLoading}
                            >
                              <CheckIcon className='h-3.5 w-3.5 text-green-600' />
                            </Button>
                          }
                        />
                        <TooltipContent>Approve user</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size='icon-sm'
                              variant='outline'
                              onClick={() => onReject(user.id)}
                              disabled={isActionLoading}
                            >
                              <XIcon className='h-3.5 w-3.5 text-red-600' />
                            </Button>
                          }
                        />
                        <TooltipContent>Reject and delete user</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {status === 'active' && user.role !== 'admin' && (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size='icon-sm'
                              variant='outline'
                              onClick={() => onSetConfirmAction({ type: 'make-admin', user })}
                              disabled={isActionLoading}
                            >
                              <ShieldIcon className='h-3.5 w-3.5' />
                            </Button>
                          }
                        />
                        <TooltipContent>Make admin</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size='icon-sm'
                              variant='outline'
                              onClick={() => onBan(user.id)}
                              disabled={isActionLoading}
                            >
                              <BanIcon className='h-3.5 w-3.5 text-red-600' />
                            </Button>
                          }
                        />
                        <TooltipContent>Ban user</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                  {status === 'active' && user.role === 'admin' && adminCount > 1 && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size='icon-sm'
                            variant='outline'
                            onClick={() => onSetConfirmAction({ type: 'remove-admin', user })}
                            disabled={isActionLoading}
                          >
                            <ShieldOffIcon className='h-3.5 w-3.5 text-red-600' />
                          </Button>
                        }
                      />
                      <TooltipContent>Remove admin</TooltipContent>
                    </Tooltip>
                  )}
                  {status === 'banned' && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            size='icon-sm'
                            variant='outline'
                            onClick={() => onUnban(user.id)}
                            disabled={isActionLoading}
                          >
                            <CheckIcon className='h-3.5 w-3.5' />
                          </Button>
                        }
                      />
                      <TooltipContent>Unban user</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </TabsContent>
  )
}
