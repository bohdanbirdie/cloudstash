import {
  ArchiveIcon,
  InboxIcon,
  ListIcon,
  CheckCircle2Icon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  archive: ArchiveIcon,
  "check-circle": CheckCircle2Icon,
  inbox: InboxIcon,
  list: ListIcon,
};

export function getIcon(name: string): LucideIcon | undefined {
  return iconMap[name];
}
