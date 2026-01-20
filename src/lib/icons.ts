import { InboxIcon, ListIcon, CheckCircle2Icon, Trash2Icon, type LucideIcon } from 'lucide-react'

const iconMap: Record<string, LucideIcon> = {
  inbox: InboxIcon,
  list: ListIcon,
  'check-circle': CheckCircle2Icon,
  trash: Trash2Icon,
}

export function getIcon(name: string): LucideIcon | undefined {
  return iconMap[name]
}
