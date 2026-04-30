import { memo } from "react";

import { ActivityGrid } from "@/components/activity-grid/activity-grid";

export const WeeklyDigest = memo(function WeeklyDigest() {
  return (
    <div className="flex flex-col gap-8 pt-3 pr-2 pb-8">
      <ActivityGrid />
    </div>
  );
});
