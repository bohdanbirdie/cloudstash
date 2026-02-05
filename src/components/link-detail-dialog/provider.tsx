import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

import { type LinkProjection } from "@/lib/link-projections";

import { LinkDetailDialogContent } from "./dialog";

interface DialogState {
  linkId: string;
  projection?: LinkProjection;
}

interface LinkDetailDialogContextValue {
  open: (options: { linkId: string; projection?: LinkProjection }) => void;
  close: () => void;
}

const LinkDetailDialogContext = createContext<LinkDetailDialogContextValue | null>(null);

const noopContext: LinkDetailDialogContextValue = {
  open: () => {},
  close: () => {},
};

export function useLinkDetailDialog() {
  const context = useContext(LinkDetailDialogContext);
  return context ?? noopContext;
}

interface LinkDetailDialogProviderProps {
  children: ReactNode;
}

export function LinkDetailDialogProvider({ children }: LinkDetailDialogProviderProps) {
  const [state, setState] = useState<DialogState | null>(null);

  const open = useCallback((options: { linkId: string; projection?: LinkProjection }) => {
    setState(options);
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  const navigate = useCallback((linkId: string) => {
    setState((prev) => (prev ? { ...prev, linkId } : null));
  }, []);

  return (
    <LinkDetailDialogContext.Provider value={{ open, close }}>
      {children}
      {state && (
        <LinkDetailDialogContent
          linkId={state.linkId}
          projection={state.projection}
          onClose={close}
          onNavigate={navigate}
        />
      )}
    </LinkDetailDialogContext.Provider>
  );
}
