import { DownloadIcon } from "lucide-react";
import { useState } from "react";

import { ActivityGrid } from "@/components/activity-grid/activity-grid";
import { ExportDialog } from "@/components/export-dialog";
import { usePageActions } from "@/components/page-actions-context";
import { Button } from "@/components/ui/button";

export function WeeklyDigest() {
  const { exportAction } = usePageActions();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex flex-col gap-8 pt-3 pr-2 pb-8">
      <ActivityGrid />

      {exportAction && (
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
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
    </div>
  );
}
