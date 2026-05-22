import { useRightPaneStore } from "@/stores/right-pane-store";
import { useSelectionStore } from "@/stores/selection-store";

export function resetTransientPageState(): void {
  useRightPaneStore.getState().closeDetail();
  useSelectionStore.getState().clear();
}
