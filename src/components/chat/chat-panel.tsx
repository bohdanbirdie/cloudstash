import { MessageSquareIcon, XIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  Suspense,
  type ReactNode,
} from "react";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";

import { ChatContent } from "@/components/chat/chat-content";
import { ChatContext } from "@/components/chat/chat-context";
import { ChatLoading } from "@/components/chat/chat-loading";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import { useAuth } from "@/lib/auth";

const PanelRefContext = createContext<React.RefObject<PanelImperativeHandle | null> | null>(null);

function useChatPanelRef() {
  const ref = useContext(PanelRefContext);
  if (!ref) {
    throw new Error("useChatPanelRef must be used within ChatPanelProvider");
  }
  return ref;
}

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const panelRef = usePanelRef();

  const open = useCallback(() => {
    // Use resize() with fixed percentage to avoid jitter from layout restoration
    panelRef.current?.resize(30);
  }, [panelRef]);

  const close = useCallback(() => {
    panelRef.current?.collapse();
  }, [panelRef]);

  const toggle = useCallback(() => {
    const isCollapsed = panelRef.current?.isCollapsed() ?? true;
    if (isCollapsed) {
      panelRef.current?.resize(30);
    } else {
      panelRef.current?.collapse();
    }
  }, [panelRef]);

  const isOpen = !(panelRef.current?.isCollapsed() ?? true);

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle }}>
      <PanelRefContext.Provider value={panelRef}>
        {children}
      </PanelRefContext.Provider>
    </ChatContext.Provider>
  );
}

export { useChatPanel } from "@/components/chat/chat-context";

export function ChatPanelHandle() {
  return <ResizableHandle withHandle />;
}

export function ChatPanel() {
  const { orgId } = useAuth();
  const { close } = useContext(ChatContext)!;
  const panelRef = useChatPanelRef();

  if (!orgId) return null;

  return (
    <ResizablePanel
      id="chat"
      panelRef={panelRef}
      collapsible
      collapsedSize={0}
      defaultSize={0}
      minSize="350px"
      maxSize="600px"
    >
      <aside className="bg-background flex flex-col h-full w-full overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="size-4" />
            <span className="font-medium text-sm">Chat Assistant</span>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={close}>
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden p-4 pb-0">
          <Suspense fallback={<ChatLoading />}>
            <ChatContent workspaceId={orgId} />
          </Suspense>
        </div>
      </aside>
    </ResizablePanel>
  );
}
