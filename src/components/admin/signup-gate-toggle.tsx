import { toast } from "sonner";

import { Switch } from "@/components/ui/switch";

import { useSignupGate } from "./use-signup-gate";

export function SignupGateToggle() {
  const { gateEnabled, isLoading, isSaving, setGateEnabled } =
    useSignupGate(true);

  const handleChange = (next: boolean) => {
    setGateEnabled(next).catch((err: unknown) =>
      toast.error("Couldn’t update signup setting", {
        description: err instanceof Error ? err.message : "Please try again.",
      })
    );
  };

  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch
        size="sm"
        aria-label="Require approval for new signups"
        checked={gateEnabled ?? false}
        onCheckedChange={handleChange}
        disabled={isLoading || isSaving || gateEnabled === undefined}
      />
      <span>Require approval for new signups</span>
    </label>
  );
}
