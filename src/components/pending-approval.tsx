import { ClockIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputOTP } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";

import { useRedeemInvite } from "./use-redeem-invite";

const CODE_LENGTH = 6;

export function PendingApproval() {
  const { logout } = useAuth();
  const { redeem, isRedeeming, error } = useRedeemInvite();
  const [code, setCode] = useState("");

  const handleSignOut = async () => {
    await logout();
    window.location.reload();
  };

  const handleRedeem = async (codeToRedeem?: string) => {
    const finalCode = codeToRedeem || code;
    if (finalCode.length !== CODE_LENGTH) {
      return;
    }
    await redeem(finalCode);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h1 className="text-xl font-semibold mb-2">
            Account Pending Approval
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account is waiting for admin approval. You&apos;ll be able to
            access the app once approved.
          </p>

          <div className="border-t pt-4 mt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Have an invite code?
            </p>
            <InputOTP
              length={CODE_LENGTH}
              value={code}
              onChange={setCode}
              onComplete={handleRedeem}
              disabled={isRedeeming}
            />
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <Button
              onClick={() => handleRedeem()}
              disabled={code.length !== CODE_LENGTH || isRedeeming}
              className="mt-4 w-full"
            >
              {isRedeeming ? <Spinner className="size-4 mr-2" /> : null}
              Redeem Code
            </Button>
          </div>

          <Button variant="outline" onClick={handleSignOut} className="mt-6">
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
