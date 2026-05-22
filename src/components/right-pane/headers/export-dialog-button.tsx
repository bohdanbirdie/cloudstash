import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { Button } from "@/components/ui/button";
import { SharedTooltipTrigger } from "@/components/ui/shared-tooltip";

export function ExportDialogButton({
  ids,
  pageTitle,
}: {
  ids: readonly string[];
  pageTitle: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <SharedTooltipTrigger
        payload="Export"
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setOpen(true)}
            aria-label="Export"
          >
            <DownloadIcon />
          </Button>
        }
      />
      {open && (
        <ExportDialog
          open={open}
          onOpenChange={setOpen}
          ids={[...ids]}
          pageTitle={pageTitle}
        />
      )}
    </>
  );
}
