import { createFileRoute, redirect } from '@tanstack/react-router'
import { authClient } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
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
