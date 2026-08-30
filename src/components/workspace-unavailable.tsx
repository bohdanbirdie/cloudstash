import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { logout } from "@/lib/auth";

// The library is created by resolveActiveOrg, which runs only in Better Auth's
// session.create.before hook. Reloading re-reads the same session and never
// re-runs it, so signing back in — a new session — is the only recovery the
// client can offer. Account deletion is deliberately absent: it resolves the
// personal organization by slug and fails for an account that never got one.
export function WorkspaceUnavailable() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Card className="py-6 md:py-8">
          <CardContent className="px-6 md:px-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Setting up
                </span>
                <h1 className="text-2xl font-bold">
                  Your library isn&rsquo;t ready
                </h1>
                <p className="text-muted-foreground text-balance">
                  Your account is approved, but we couldn&rsquo;t finish
                  preparing your library. Signing in again usually finishes it.
                </p>
              </div>
              <Button onClick={() => void logout()}>
                Sign out and back in
              </Button>
              <FieldDescription className="text-center">
                If this keeps happening, contact support and we&rsquo;ll set up
                your library for you.
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
