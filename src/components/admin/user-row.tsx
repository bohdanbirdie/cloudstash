import { useState } from 'react'
import useSWRMutation from 'swr/mutation'
import { mutate } from 'swr'
import { CheckIcon, XIcon, BanIcon, ShieldIcon, ShieldOffIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
import { authClient } from '@/lib/auth'
import type { AdminUser } from '@/types/api'
import { getUserStatus } from './use-users-admin'

interface UserRowProps {
  user: AdminUser
  adminCount: number
}

async function approveUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.updateUser({
    userId: arg.userId,
    data: { approved: true },
  })
  if (error) throw new Error(error.message)
  mutate('admin-users')
}

async function rejectUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.removeUser({ userId: arg.userId })
  if (error) throw new Error(error.message)
  mutate('admin-users')
}

async function banUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.banUser({
    userId: arg.userId,
    banReason: 'Banned by admin',
  })
  if (error) throw new Error(error.message)
  mutate('admin-users')
}

async function unbanUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.unbanUser({ userId: arg.userId })
  if (error) throw new Error(error.message)
  mutate('admin-users')
}

async function setUserRole(
  _: string,
  { arg }: { arg: { userId: string; role: 'admin' | 'user' } },
) {
  const { error } = await authClient.admin.setRole({ userId: arg.userId, role: arg.role })
  if (error) throw new Error(error.message)
  mutate('admin-users')
}

export function UserRow({ user, adminCount }: UserRowProps) {
  const [confirmAction, setConfirmAction] = useState<'make-admin' | 'remove-admin' | null>(null)

  const approve = useSWRMutation('approve-user', approveUser)
  const reject = useSWRMutation('reject-user', rejectUser)
  const ban = useSWRMutation('ban-user', banUser)
  const unban = useSWRMutation('unban-user', unbanUser)
  const setRole = useSWRMutation('set-user-role', setUserRole)

  const status = getUserStatus(user)
  const isLoading =
    approve.isMutating ||
    reject.isMutating ||
    ban.isMutating ||
    unban.isMutating ||
    setRole.isMutating

  const handleConfirmAction = () => {
    if (confirmAction === 'make-admin') {
      setRole.trigger({ userId: user.id, role: 'admin' })
    } else if (confirmAction === 'remove-admin') {
      setRole.trigger({ userId: user.id, role: 'user' })
    }
    setConfirmAction(null)
  }

  return (
    <>
      <div className='flex items-center justify-between p-3 bg-muted/50 gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='font-medium text-xs truncate'>{user.name}</span>
            {user.role === 'admin' && <Badge variant='secondary'>Admin</Badge>}
            {status === 'pending' && (
              <Badge variant='outline' className='bg-yellow-50 text-yellow-700 border-yellow-200'>
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
                      onClick={() => approve.trigger({ userId: user.id })}
                      disabled={isLoading}
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
                      onClick={() => reject.trigger({ userId: user.id })}
                      disabled={isLoading}
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
                      onClick={() => setConfirmAction('make-admin')}
                      disabled={isLoading}
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
                      onClick={() => ban.trigger({ userId: user.id })}
                      disabled={isLoading}
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
                    onClick={() => setConfirmAction('remove-admin')}
                    disabled={isLoading}
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
                    onClick={() => unban.trigger({ userId: user.id })}
                    disabled={isLoading}
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

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'make-admin' ? 'Make admin?' : 'Remove admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'make-admin'
                ? `This will give ${user.name} full admin privileges.`
                : `This will remove admin privileges from ${user.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmAction === 'remove-admin' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
            >
              {confirmAction === 'make-admin' ? 'Make admin' : 'Remove admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
