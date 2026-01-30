import { DownloadIcon } from "lucide-react";
import { useState, useEffect } from "react";

import { ExportDialog } from "@/components/export-dialog";
import { LinkGrid, ViewSwitcher } from "@/components/link-card";
import { SelectionToolbar } from "@/components/selection-toolbar";
import { Button } from "@/components/ui/button";
import { type LinkWithDetails } from "@/livestore/queries";
import { useSelectionStore } from "@/stores/selection-store";

interface LinksPageLayoutProps {
  title: string;
  subtitle: string;
  links: readonly LinkWithDetails[];
  emptyMessage: string;
  toolbarConfig: {
    onComplete?: (links: LinkWithDetails[]) => void;
    onDelete: (links: LinkWithDetails[]) => void;
    isCompleted?: boolean;
    isTrash?: boolean;
    showComplete?: boolean;
  };
}

export function LinksPageLayout({
  title,
  subtitle,
  links,
  emptyMessage,
  toolbarConfig,
}: LinksPageLayoutProps) {
  const clear = useSelectionStore((s) => s.clear);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedLinks, setSelectedLinks] = useState<LinkWithDetails[]>([]);

  useEffect(() => clear, [clear]);

  const handleComplete = toolbarConfig.onComplete
    ? () => toolbarConfig.onComplete!(selectedLinks)
    : undefined;

  const handleDelete = () => toolbarConfig.onDelete(selectedLinks);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
          >
            <DownloadIcon className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      <LinkGrid
        links={links}
        emptyMessage={emptyMessage}
        onSelectionChange={setSelectedLinks}
      />
      <SelectionToolbar
        selectedCount={selectedLinks.length}
        onExport={() => setExportOpen(true)}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onClear={clear}
        isCompleted={toolbarConfig.isCompleted}
        isTrash={toolbarConfig.isTrash}
        showComplete={toolbarConfig.showComplete}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        links={selectedLinks.length > 0 ? selectedLinks : links}
        pageTitle={selectedLinks.length > 0 ? "Selected Links" : title}
      />
    </div>
  );
}
