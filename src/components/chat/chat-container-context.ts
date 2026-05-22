import { createContext, useContext } from "react";
import type { RefObject } from "react";

export const ChatContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null);
export const useChatContainer = () => useContext(ChatContainerContext);
