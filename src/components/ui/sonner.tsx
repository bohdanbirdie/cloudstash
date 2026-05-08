import { Toaster as SonnerToaster } from "sonner";
import type { ToasterProps } from "sonner";

function Toaster({ toastOptions, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      offset={20}
      duration={5000}
      {...props}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "group/toast flex !w-[22rem] items-center gap-3 !rounded-lg !border-0 !bg-popover !p-3 !font-sans !text-xs !text-popover-foreground !shadow-md ring-1 ring-foreground/10",
          title: "!font-medium tracking-tight !text-foreground",
          description: "mt-0.5 !text-muted-foreground tabular-nums",
          actionButton:
            "shrink-0 !h-auto !rounded-none !bg-transparent !px-1 !py-0 !text-xs !font-medium !text-foreground/80 underline underline-offset-4 decoration-foreground/30 transition-colors hover:!text-foreground hover:decoration-foreground",
          ...toastOptions?.classNames,
        },
      }}
    />
  );
}

export { Toaster };
