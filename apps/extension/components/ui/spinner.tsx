import { Loader2Icon } from "lucide-react";

import { cn } from "../../lib/utils";

// Decorative by default (aria-hidden): the spinning icon itself carries no
// information. Wrap it in a `role="status"` live region that holds the label,
// rather than letting the icon announce a second "Loading".
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      aria-hidden="true"
      className={cn("size-4 animate-spin text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Spinner };
