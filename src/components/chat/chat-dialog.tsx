import { MessageSquareIcon } from "lucide-react";
import { Suspense } from "react";

import { ChatContent } from "@/components/chat/chat-content";
import { ChatLoading } from "@/components/chat/chat-loading";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChatDialog({ open, onOpenChange }: ChatDialogProps) {
  const { orgId } = useAuth();

  if (!orgId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] grid-rows-[auto_1fr] gap-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareIcon className="size-4" />
            Chat Assistant
          </DialogTitle>
          <DialogDescription>
            Ask questions about your links or use commands to manage them.
          </DialogDescription>
        </DialogHeader>

        {open && (
          <Suspense fallback={<ChatLoading />}>
            <ChatContent workspaceId={orgId} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
