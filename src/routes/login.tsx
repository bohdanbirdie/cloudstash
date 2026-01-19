import { createFileRoute, Navigate } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className='flex h-screen w-screen items-center justify-center'>
        <Spinner className='size-8' />
      </div>
    )
  }

  if (session) {
    return <Navigate to='/' />
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-background p-4'>
      <Card className='w-full max-w-md'>
        <CardHeader className='text-center'>
          <CardTitle className='text-2xl'>Welcome to Link Bucket</CardTitle>
          <CardDescription>Sign in to save and organize your links</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className='w-full'
            onClick={() => authClient.signIn.social({ provider: 'google' })}
          >
            Sign in with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
