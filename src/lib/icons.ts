import {
  InboxIcon,
  ListIcon,
  CheckCircle2Icon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  "check-circle": CheckCircle2Icon,
  inbox: InboxIcon,
  list: ListIcon,
  trash: Trash2Icon,
};

export function getIcon(name: string): LucideIcon | undefined {
  return iconMap[name];
}
