import {
  createContext,
  useContext,
  useState,
  useRef,
  Suspense,
  type RefObject,
} from "react";

import { ChatContent } from "@/components/chat/chat-content";
import { ChatLoading } from "@/components/chat/chat-loading";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const ChatContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);
export const useChatContainer = () => useContext(ChatContainerContext);

export function ChatSheet({
  open,
  onOpenChange,
  side = "bottom",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "bottom" | "right";
}) {
  const { orgId } = useAuth();
  const [hasOpened, setHasOpened] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (open && !hasOpened) setHasOpened(true);

  if (!orgId || !hasOpened) return null;

  const isBottom = side === "bottom";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        keepMounted
        className={cn(
          "p-0 px-1",
          isBottom ? "rounded-t-xl" : "data-[side=right]:sm:max-w-md"
        )}
        style={isBottom ? { height: "85dvh" } : undefined}
        showCloseButton={false}
      >
        <div
          ref={containerRef}
          className="flex flex-col h-full overflow-hidden"
        >
          {isBottom && (
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-muted-foreground/20" />
            </div>
          )}
          <SheetHeader className="sr-only">
            <SheetTitle>Chat Assistant</SheetTitle>
          </SheetHeader>
          <ChatContainerContext.Provider value={containerRef}>
            <Suspense fallback={<ChatLoading />}>
              <ChatContent workspaceId={orgId} />
            </Suspense>
          </ChatContainerContext.Provider>
        </div>
      </SheetContent>
    </Sheet>
  );
}
