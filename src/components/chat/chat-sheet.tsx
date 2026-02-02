import { MessageSquareIcon, XIcon } from "lucide-react";
import { useCallback, useState, Suspense, type ReactNode } from "react";

import { ChatContent } from "@/components/chat/chat-content";
import { ChatContext } from "@/components/chat/chat-context";
import { ChatLoading } from "@/components/chat/chat-loading";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";

export function ChatSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </ChatContext.Provider>
  );
}

export function ChatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { orgId } = useAuth();

  if (!orgId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-xl p-0"
        style={{ height: "85dvh" }}
        showCloseButton={false}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex justify-center py-2 shrink-0">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/20" />
          </div>
          <SheetHeader className="sr-only">
            <SheetTitle>Chat Assistant</SheetTitle>
          </SheetHeader>
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
            <div className="flex items-center gap-2">
              <MessageSquareIcon className="size-4" />
              <span className="font-medium text-sm">Chat Assistant</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </header>
          <div className="flex-1 min-h-0 p-4">
            <Suspense fallback={<ChatLoading />}>
              <ChatContent workspaceId={orgId} />
            </Suspense>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
