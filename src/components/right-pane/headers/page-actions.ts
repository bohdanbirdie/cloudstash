import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  UndoIcon,
} from "lucide-react";

import type { LinkStatus } from "@/livestore/queries/filtered-links";

export type LinkAction = "complete" | "uncomplete" | "archive" | "restore";

export const ACTION_META: Record<
  LinkAction,
  { icon: typeof CheckIcon; label: string }
> = {
  complete: { icon: CheckIcon, label: "Complete" },
  uncomplete: { icon: UndoIcon, label: "Reopen" },
  archive: { icon: ArchiveIcon, label: "Archive" },
  restore: { icon: ArchiveRestoreIcon, label: "Restore" },
};

export function actionRemovesFromPage(
  action: LinkAction,
  page: LinkStatus | undefined
): boolean {
  switch (page) {
    case "all":
      return action === "archive";
    case "completed":
      return action === "uncomplete" || action === "archive";
    case "archive":
      return action === "restore";
    case "inbox":
      return action === "complete" || action === "archive";
    default:
      return false;
  }
}

export function pageBulkToggle(page: LinkStatus | undefined): {
  primary: "complete" | "uncomplete" | null;
  secondary: "archive" | "restore";
} {
  if (page === "archive") return { primary: null, secondary: "restore" };
  if (page === "completed")
    return { primary: "uncomplete", secondary: "archive" };
  return { primary: "complete", secondary: "archive" };
}
