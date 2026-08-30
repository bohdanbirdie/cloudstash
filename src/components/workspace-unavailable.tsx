import { useState } from "react";

import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { invalidateAuthCache, logout } from "@/lib/auth";

export function WorkspaceUnavailable() {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleRetry = () => {
    invalidateAuthCache();
    window.location.reload();
  };

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
                  preparing your library. Trying again usually fixes it.
                </p>
              </div>
              <Button onClick={handleRetry}>Try again</Button>
              <FieldDescription className="text-center">
                Still stuck?{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void logout()}
                >
                  Sign out
                </button>{" "}
                and back in, or{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => setDeleteOpen(true)}
                >
                  delete your account
                </button>
                .
              </FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
