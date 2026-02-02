import { MessageSquareIcon, XIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  Suspense,
  type ReactNode,
} from "react";
import { usePanelRef, type PanelImperativeHandle } from "react-resizable-panels";

import { ChatContent } from "@/components/chat/chat-content";
import { ChatLoading } from "@/components/chat/chat-loading";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/lib/auth";

type ChatPanelContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const ChatPanelContext = createContext<ChatPanelContextType | null>(null);

export function useChatPanel() {
  const context = useContext(ChatPanelContext);
  if (!context) {
    throw new Error("useChatPanel must be used within a ChatPanelProvider");
  }
  return context;
}

const PanelRefContext = createContext<React.RefObject<PanelImperativeHandle | null> | null>(null);

function useChatPanelRef() {
  const ref = useContext(PanelRefContext);
  if (!ref) {
    throw new Error("useChatPanelRef must be used within ChatPanelProvider");
  }
  return ref;
}

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const panelRef = usePanelRef();
  const [mobileOpen, setMobileOpen] = useState(false);

  const open = useCallback(() => {
    if (isMobile) {
      setMobileOpen(true);
    } else {
      panelRef.current?.expand();
    }
  }, [isMobile, panelRef]);

  const close = useCallback(() => {
    if (isMobile) {
      setMobileOpen(false);
    } else {
      panelRef.current?.collapse();
    }
  }, [isMobile, panelRef]);

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      const isCollapsed = panelRef.current?.isCollapsed() ?? true;
      if (isCollapsed) {
        panelRef.current?.expand();
      } else {
        panelRef.current?.collapse();
      }
    }
  }, [isMobile, panelRef]);

  const isOpen = isMobile
    ? mobileOpen
    : !(panelRef.current?.isCollapsed() ?? true);

  return (
    <ChatPanelContext.Provider value={{ isOpen, open, close, toggle }}>
      <PanelRefContext.Provider value={panelRef}>
        <MobileOpenContext.Provider value={mobileOpen}>
          <SetMobileOpenContext.Provider value={setMobileOpen}>
            {children}
          </SetMobileOpenContext.Provider>
        </MobileOpenContext.Provider>
      </PanelRefContext.Provider>
    </ChatPanelContext.Provider>
  );
}

const MobileOpenContext = createContext<boolean>(false);
const SetMobileOpenContext = createContext<React.Dispatch<React.SetStateAction<boolean>>>(() => {});

export function ChatPanelHandle() {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return <ResizableHandle withHandle />;
}

export function ChatPanel() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <ChatPanelMobile />;
  }

  return <ChatPanelDesktop />;
}

function ChatPanelDesktop() {
  const { orgId } = useAuth();
  const { close } = useChatPanel();
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
      <ChatPanelContent onClose={close} workspaceId={orgId} />
    </ResizablePanel>
  );
}

function ChatPanelMobile() {
  const { orgId } = useAuth();
  const mobileOpen = useContext(MobileOpenContext);
  const setMobileOpen = useContext(SetMobileOpenContext);

  if (!orgId) return null;

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
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
              onClick={() => setMobileOpen(false)}
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

function ChatPanelContent({
  onClose,
  workspaceId,
}: {
  onClose: () => void;
  workspaceId: string;
}) {
  return (
    <aside className="bg-background flex flex-col h-full w-full overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquareIcon className="size-4" />
          <span className="font-medium text-sm">Chat Assistant</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden p-4">
        <Suspense fallback={<ChatLoading />}>
          <ChatContent workspaceId={workspaceId} />
        </Suspense>
      </div>
    </aside>
  );
}
