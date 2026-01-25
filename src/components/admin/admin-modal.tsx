import { useState, useEffect } from 'react'
import { UsersIcon, TicketIcon } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useUsersAdmin } from './use-users-admin'
import { useInvitesAdmin } from './use-invites-admin'
import { UsersTab } from './users-tab'
import { InvitesTab } from './invites-tab'

interface AdminModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdminModal({ open, onOpenChange }: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>('users')

  const users = useUsersAdmin()
  const invites = useInvitesAdmin()

  useEffect(() => {
    if (open) {
      users.fetchUsers()
      invites.fetchInvites()
    } else {
      invites.reset()
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-lg max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Admin</DialogTitle>
          <DialogDescription>Manage users, approvals, and invite codes</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className='flex-1 flex flex-col min-h-0'>
          <TabsList variant='line'>
            <TabsTrigger value='users'>
              <UsersIcon className='h-3.5 w-3.5' />
              Users
              {users.pendingCount > 0 && (
                <Badge variant='outline' className='ml-1 h-4 px-1 text-[10px]'>
                  {users.pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value='invites'>
              <TicketIcon className='h-3.5 w-3.5' />
              Invites
              {invites.availableCount > 0 && (
                <Badge variant='outline' className='ml-1 h-4 px-1 text-[10px]'>
                  {invites.availableCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <UsersTab
            users={users.users}
            isLoading={users.isLoading}
            error={users.error}
            actionLoading={users.actionLoading}
            pendingCount={users.pendingCount}
            activeCount={users.activeCount}
            adminCount={users.adminCount}
            onApprove={users.handleApprove}
            onReject={users.handleReject}
            onBan={users.handleBan}
            onUnban={users.handleUnban}
            onSetConfirmAction={users.setConfirmAction}
          />

          <InvitesTab
            invites={invites.invites}
            isLoading={invites.isLoading}
            error={invites.error}
            isCreating={invites.isCreating}
            actionLoading={invites.actionLoading}
            newInviteCode={invites.newInviteCode}
            copiedCode={invites.copiedCode}
            onCreate={invites.handleCreate}
            onDelete={invites.handleDelete}
            onCopyCode={invites.handleCopyCode}
          />
        </Tabs>
      </DialogContent>

      <AlertDialog
        open={!!users.confirmAction}
        onOpenChange={(open) => !open && users.setConfirmAction(null)}
      >
        <AlertDialogContent size='sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {users.confirmAction?.type === 'make-admin' ? 'Make admin?' : 'Remove admin?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {users.confirmAction?.type === 'make-admin'
                ? `This will give ${users.confirmAction.user.name} full admin privileges.`
                : `This will remove admin privileges from ${users.confirmAction?.user.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={users.confirmAction?.type === 'remove-admin' ? 'destructive' : 'default'}
              onClick={users.handleConfirmAction}
            >
              {users.confirmAction?.type === 'make-admin' ? 'Make admin' : 'Remove admin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
