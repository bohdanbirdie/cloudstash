import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";

export function ApplicationFrame({
  children,
  dock,
}: {
  children: ReactNode;
  dock?: ReactNode;
}) {
  return (
    <div className="flex h-svh flex-col bg-background">
      <div className="mx-auto flex h-full w-full min-h-0 max-w-7xl flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        {dock !== undefined ? (
          <div className="relative z-50 flex h-20 shrink-0 items-center justify-center">
            {dock}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LibraryLayout({
  topBar,
  tagStrip,
  masthead,
  children,
  rightPane,
  loadingState,
}: {
  topBar: ReactNode;
  tagStrip?: ReactNode;
  masthead: ReactNode;
  children: ReactNode;
  rightPane: ReactNode;
  loadingState?: ReactNode;
}) {
  return (
    <div className="h-full overflow-hidden">
      <div className="flex h-full flex-col px-4 pt-4 pb-6 lg:px-8 lg:pt-6">
        {topBar}
        {tagStrip}

        {loadingState ? (
          <div className="min-h-0 flex-1">{loadingState}</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-8 lg:grid-cols-[minmax(0,820px)_540px]">
            <div className="flex min-h-0 min-w-0 flex-col">
              {masthead}
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-1 lg:px-3">{children}</div>
              </ScrollArea>
            </div>
            {/* CSS-gated with the matching mobile sheet so both detail
                surfaces stay mounted but can never be visible together. */}
            <div className="hidden lg:contents">{rightPane}</div>
          </div>
        )}
      </div>
    </div>
  );
}
