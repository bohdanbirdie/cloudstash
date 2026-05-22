import { Skeleton } from "@/components/ui/skeleton";

export function AgentSkeleton() {
  return (
    <>
      <SkeletonAssistant lines={[88, 70]} />
      <SkeletonUser width={42} />
      <SkeletonAssistant lines={[92, 80, 60]} />
      <SkeletonUser width={28} />
      <SkeletonAssistant lines={[80, 65]} />
    </>
  );
}

function SkeletonAssistant({ lines }: { lines: number[] }) {
  return (
    <div className="flex">
      <div className="flex w-full flex-col gap-1.5">
        {lines.map((width, i) => (
          <Skeleton
            key={i}
            className="h-3 rounded-sm"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonUser({ width }: { width: number }) {
  return (
    <div className="flex justify-end">
      <Skeleton className="h-7 rounded-md" style={{ width: `${width}%` }} />
    </div>
  );
}
