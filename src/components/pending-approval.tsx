import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { logout } from "@/lib/auth";
import { INVITE_CODE_LENGTH } from "@/lib/invite";

import { useRedeemInvite } from "./use-redeem-invite";

const HALF = INVITE_CODE_LENGTH / 2;

export function PendingApproval() {
  const { redeem, isRedeeming, error, clearError } = useRedeemInvite();
  const [code, setCode] = useState("");

  const handleChange = (next: string) => {
    if (error) clearError();
    setCode(next.toUpperCase());
  };

  const handleSignOut = () => {
    void logout();
  };

  const handleRedeem = async (codeToRedeem?: string) => {
    const finalCode = codeToRedeem ?? code;
    if (finalCode.length !== INVITE_CODE_LENGTH) return;
    await redeem(finalCode);
  };

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Card className="py-6 md:py-8">
          <CardContent className="px-6 md:px-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Pending
                </span>
                <h1 className="text-2xl font-bold">
                  We&rsquo;ll get you in soon
                </h1>
                <p className="text-muted-foreground text-balance">
                  Your account is in the queue. If you have an invite code, skip
                  the wait.
                </p>
              </div>
              <Field>
                <InputOTP
                  autoFocus
                  maxLength={INVITE_CODE_LENGTH}
                  value={code}
                  onChange={handleChange}
                  onComplete={handleRedeem}
                  disabled={isRedeeming}
                  pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    {Array.from({ length: HALF }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="font-mono uppercase"
                      />
                    ))}
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    {Array.from({ length: HALF }).map((_, i) => (
                      <InputOTPSlot
                        key={HALF + i}
                        index={HALF + i}
                        className="font-mono uppercase"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                {error ? (
                  <FieldError className="text-center">{error}</FieldError>
                ) : null}
              </Field>
              <Button
                className="w-full"
                onClick={() => handleRedeem()}
                disabled={code.length !== INVITE_CODE_LENGTH || isRedeeming}
              >
                {isRedeeming ? <Spinner className="mr-2 size-4" /> : null}
                Unlock
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
        <FieldDescription className="px-6 text-center">
          Wrong account?{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleSignOut();
            }}
          >
            Use a different account
          </a>
          .
        </FieldDescription>
      </div>
    </div>
  );
}
