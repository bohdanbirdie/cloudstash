import { createContext, useContext } from "react";

export type ChatContextType = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

export const ChatContext = createContext<ChatContextType | null>(null);

export function useChatPanel() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatPanel must be used within a ChatProvider");
  }
  return context;
}
