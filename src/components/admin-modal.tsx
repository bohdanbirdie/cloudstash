import { useState, useEffect } from 'react'
import {
  CheckIcon,
  XIcon,
  BanIcon,
  ShieldIcon,
  ShieldOffIcon,
  UsersIcon,
  ClockIcon,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { authClient } from '@/lib/auth'

interface User {
  id: string
  name: string
  email: string
  role: string | null
  approved: boolean
  banned: boolean
  createdAt: Date
}

interface AdminModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ConfirmAction = {
  type: 'make-admin' | 'remove-admin'
  user: User
} | null

export function AdminModal({ open, onOpenChange }: AdminModalProps) {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const fetchUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await authClient.admin.listUsers({
        query: {
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
      })
      if (error) {
        setError(error.message || 'Failed to fetch users')
        return
      }
      setUsers((data?.users as User[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchUsers()
    }
  }, [open])

  const handleApprove = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.updateUser({
        userId,
        data: { approved: true },
      })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.removeUser({ userId })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleBan = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.banUser({
        userId,
        banReason: 'Banned by admin',
      })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUnban = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.unbanUser({ userId })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleMakeAdmin = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.setRole({ userId, role: 'admin' })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set admin role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemoveAdmin = async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.setRole({ userId, role: 'user' })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove admin role')
    } finally {
      setActionLoading(null)
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    const { type, user } = confirmAction
    setConfirmAction(null)
    if (type === 'make-admin') {
      await handleMakeAdmin(user.id)
    } else if (type === 'remove-admin') {
      await handleRemoveAdmin(user.id)
    }
  }

  const getUserStatus = (user: User) => {
    if (user.banned) return 'banned'
    if (!user.approved) return 'pending'
    return 'active'
  }

  // Stats
  const pendingCount = users.filter((u) => !u.approved && !u.banned).length
  const activeCount = users.filter((u) => u.approved && !u.banned).length
  const adminCount = users.filter((u) => u.role === 'admin').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Admin</DialogTitle>
          <DialogDescription>Manage users and approvals</DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className='flex gap-4 text-xs'>
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
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* User list */}
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
                                onClick={() => handleApprove(user.id)}
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
                                onClick={() => handleReject(user.id)}
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
                                onClick={() => setConfirmAction({ type: 'make-admin', user })}
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
                                onClick={() => handleBan(user.id)}
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
                              onClick={() => setConfirmAction({ type: 'remove-admin', user })}
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
                              onClick={() => handleUnban(user.id)}
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
      </DialogContent>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === 'make-admin' ? 'Make admin?' : 'Remove admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === 'make-admin'
                ? `This will give ${confirmAction.user.name} full admin privileges.`
                : `This will remove admin privileges from ${confirmAction?.user.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction?.type === 'remove-admin' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
            >
              {confirmAction?.type === 'make-admin' ? 'Make admin' : 'Remove admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
