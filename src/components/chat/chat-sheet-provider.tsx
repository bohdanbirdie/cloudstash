import { useCallback, useState, type ReactNode } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { ChatContext } from "@/components/chat/chat-context";

export const CHAT_HOTKEY = "meta+j";

export function ChatSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useHotkeys(CHAT_HOTKEY, toggle, { preventDefault: true });

  return (
    <ChatContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </ChatContext.Provider>
  );
}
