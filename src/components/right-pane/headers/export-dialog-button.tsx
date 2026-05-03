import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      <Tooltip>
        <TooltipTrigger
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
        <TooltipContent>Export</TooltipContent>
      </Tooltip>
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
