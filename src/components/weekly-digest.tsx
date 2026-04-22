import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { usePageActions } from "@/components/page-actions-context";
import { Button } from "@/components/ui/button";

const PLACEHOLDER_BODY =
  "You spent the week on performance and edge infrastructure — fragment shaders, the Web Animation Performance Tier List, and compositor-vs-layout trade-offs. A thread worth following: two saves on stateful serverless connect to the edge work you saved last month. Worth a revisit: the OKLCH color-space article you haven't opened in a month.";

export function WeeklyDigest() {
  const { exportAction } = usePageActions();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <aside className="sticky top-8 flex max-h-[calc(100svh-4rem)] flex-col gap-8 self-start overflow-y-auto pt-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground text-balance">
          This week's digest
        </div>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-foreground text-pretty">
          {PLACEHOLDER_BODY}
        </p>
        <div className="mt-5 text-xs text-muted-foreground/70">
          placeholder · backend not yet wired
        </div>
      </div>

      {exportAction && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
            className="transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <DownloadIcon className="mr-2 size-4" />
            Export
          </Button>
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            links={exportAction.links}
            pageTitle={exportAction.title}
          />
        </div>
      )}
    </aside>
  );
}
