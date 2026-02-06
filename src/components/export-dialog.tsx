import { CopyIcon, DownloadIcon, CheckIcon } from "lucide-react";
import { useState, useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { track } from "@/lib/analytics";
import {
  generateLinksMarkdown,
  generatePlainLinks,
} from "@/lib/export-markdown";
import { type LinkWithDetails } from "@/livestore/queries";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  links: readonly LinkWithDetails[];
  pageTitle: string;
}

export function ExportDialog({
  open,
  onOpenChange,
  links,
  pageTitle,
}: ExportDialogProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"full" | "plain">("full");

  const markdownContent = useMemo(
    () => generateLinksMarkdown(links, pageTitle),
    [links, pageTitle]
  );
  const plainContent = useMemo(() => generatePlainLinks(links), [links]);

  const currentContent = activeTab === "plain" ? plainContent : markdownContent;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    track("export_used", { method: "copy", format: activeTab });
  };

  const handleDownload = () => {
    const extension = activeTab === "plain" ? "txt" : "md";
    const mimeType = activeTab === "plain" ? "text/plain" : "text/markdown";
    const blob = new Blob([currentContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pageTitle.toLowerCase().replaceAll(/\s+/g, "-")}-export.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    track("export_used", { method: "download", format: activeTab });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Export Links</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "full" | "plain")}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList>
            <TabsTrigger value="full">Full Export</TabsTrigger>
            <TabsTrigger value="plain">Plain Links</TabsTrigger>
          </TabsList>

          <TabsContent value="full" className="flex-1 min-h-0">
            <div className="grid grid-cols-2 gap-4 h-full">
              <div className="flex flex-col min-h-0">
                <p className="text-xs text-muted-foreground mb-2">
                  Raw Markdown
                </p>
                <textarea
                  readOnly
                  value={markdownContent}
                  className="flex-1 w-full p-3 text-xs font-mono bg-muted border border-input rounded-none resize-none focus:outline-none overflow-auto"
                />
              </div>

              <div className="flex flex-col min-h-0">
                <p className="text-xs text-muted-foreground mb-2">Preview</p>
                <div className="flex-1 p-3 border border-input rounded-none overflow-auto">
                  <Markdown>{markdownContent}</Markdown>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="plain" className="flex-1 min-h-0">
            <div className="flex flex-col h-full">
              <p className="text-xs text-muted-foreground mb-2">
                One URL per line
              </p>
              <textarea
                readOnly
                value={plainContent}
                className="flex-1 w-full p-3 text-xs font-mono bg-muted border border-input rounded-none resize-none focus:outline-none overflow-auto"
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? (
              <CheckIcon className="h-4 w-4 mr-2" />
            ) : (
              <CopyIcon className="h-4 w-4 mr-2" />
            )}
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
          <Button size="sm" onClick={handleDownload}>
            <DownloadIcon className="h-4 w-4 mr-2" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
