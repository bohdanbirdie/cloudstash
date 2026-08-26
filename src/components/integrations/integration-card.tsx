import { XIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const CONTROL_TRANSITION = {
  bounce: 0,
  duration: 0.3,
  type: "spring" as const,
};

const CONTROL_STATE_MOTION = {
  animate: { filter: "blur(0px)", opacity: 1, scale: 1 },
  exit: { filter: "blur(2px)", opacity: 0, scale: 0.96 },
  initial: { filter: "blur(2px)", opacity: 0, scale: 0.96 },
};

const DISCONNECT_ICON_MOTION = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const DISCONNECT_ICON_TRANSITION = {
  duration: 0.15,
  ease: "easeOut" as const,
};

export function DisconnectButton({
  disabled,
  integration,
  isPending,
  onClick,
}: {
  disabled?: boolean;
  integration: string;
  isPending: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      aria-busy={isPending || undefined}
      aria-label={`${isPending ? "Disconnecting" : "Disconnect"} ${integration}`}
      className="px-1.5 leading-none text-destructive hover:bg-destructive/10 hover:text-destructive"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      variant="ghost"
    >
      <span aria-hidden className="relative size-3 shrink-0">
        <AnimatePresence initial={false}>
          {isPending ? (
            <motion.span
              animate="visible"
              className="absolute inset-0 grid place-items-center"
              exit="hidden"
              initial="hidden"
              key="spinner"
              transition={DISCONNECT_ICON_TRANSITION}
              variants={DISCONNECT_ICON_MOTION}
            >
              <Spinner className="size-3 motion-reduce:animate-none" />
            </motion.span>
          ) : (
            <motion.span
              className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-150 group-hover/button:opacity-100 group-focus-visible/button:opacity-100"
              exit="hidden"
              initial={false}
              key="disconnect"
              transition={DISCONNECT_ICON_TRANSITION}
              variants={DISCONNECT_ICON_MOTION}
            >
              <XIcon className="size-3" strokeWidth={2} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      Disconnect
    </Button>
  );
}

export function IntegrationItem({
  children,
  control,
  controlKey,
  description,
  icon,
  iconClassName,
  title,
}: {
  children?: React.ReactNode;
  control?: React.ReactNode;
  controlKey?: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  iconClassName?: string;
  title: string;
}) {
  const titleId = `integration-${title.toLowerCase().replaceAll(" ", "-")}`;
  const controlRootRef = useRef<HTMLDivElement>(null);
  const currentControlRef = useRef<HTMLDivElement>(null);
  const previousControlKey = useRef(controlKey);
  const setCurrentControlRef = useCallback((element: HTMLDivElement | null) => {
    if (element) currentControlRef.current = element;
  }, []);

  useLayoutEffect(() => {
    if (previousControlKey.current === controlKey) return;

    const activeElement = document.activeElement;
    const hadControlFocus =
      activeElement instanceof HTMLElement &&
      controlRootRef.current?.contains(activeElement);

    previousControlKey.current = controlKey;
    if (!hadControlFocus) return;

    currentControlRef.current
      ?.querySelector<HTMLElement>(
        "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
      )
      ?.focus();
  }, [controlKey]);

  return (
    <section aria-labelledby={titleId} className="px-3 py-3 sm:px-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5">
        <span
          aria-hidden
          className={cn(
            "col-start-1 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-foreground ring-1 ring-foreground/5",
            iconClassName
          )}
        >
          {icon}
        </span>

        <div className="col-start-2 flex min-w-0 items-center gap-x-1.5">
          <h3
            id={titleId}
            className="shrink-0 whitespace-nowrap text-sm/none font-medium"
          >
            {title}
          </h3>

          <span
            aria-hidden
            className="translate-y-px shrink-0 text-sm/none font-bold text-muted-foreground/50"
          >
            •
          </span>

          <div className="translate-y-px min-w-0 truncate whitespace-nowrap text-xs/4 text-muted-foreground">
            {description}
          </div>
        </div>

        {control && (
          <div
            ref={controlRootRef}
            className="col-start-3 flex shrink-0 flex-nowrap items-center justify-end whitespace-nowrap pl-2 [&_[data-slot=button]]:leading-none"
          >
            <motion.div
              className="relative flex h-6 items-center justify-end"
              layout="size"
              transition={CONTROL_TRANSITION}
            >
              <AnimatePresence anchorX="right" initial={false} mode="popLayout">
                <motion.div
                  ref={setCurrentControlRef}
                  animate="animate"
                  className="flex h-6 flex-nowrap items-center justify-end gap-1"
                  exit="exit"
                  initial="initial"
                  key={controlKey ?? "control"}
                  layout
                  transition={CONTROL_TRANSITION}
                  variants={CONTROL_STATE_MOTION}
                >
                  {control}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </div>

      {children}
    </section>
  );
}
