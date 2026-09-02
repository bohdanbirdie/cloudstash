const resetDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export interface UsageLimitItem {
  readonly id: string;
  readonly label: string;
  readonly limit: number;
  readonly remaining: number;
}

function remainingPercent({ limit, remaining }: UsageLimitItem): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / limit) * 100));
}

function UsageLimitRow({ item }: { item: UsageLimitItem }) {
  const remaining = item.remaining.toLocaleString();
  const limit = item.limit.toLocaleString();

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-xs font-medium text-foreground">
          {item.label}
        </span>
        <span className="shrink-0 text-[0.6875rem] tabular-nums">
          <span className="font-medium text-foreground">{remaining}</span>{" "}
          <span className="text-muted-foreground">of {limit} left</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${item.label}: ${remaining} of ${limit} remaining`}
        aria-valuemin={0}
        aria-valuemax={item.limit}
        aria-valuenow={item.remaining}
        className="h-1 overflow-hidden rounded-full bg-background"
      >
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${remainingPercent(item)}%` }}
        />
      </div>
    </div>
  );
}

export function UsageLimits({
  items,
  libraryItems = [],
  resetsAt,
}: {
  items: readonly UsageLimitItem[];
  libraryItems?: readonly UsageLimitItem[];
  resetsAt: string;
}) {
  const resetDate = resetDateFormatter.format(new Date(resetsAt));

  return (
    <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
      {libraryItems.length > 0 && (
        <div className="space-y-3">
          {libraryItems.map((item) => (
            <UsageLimitRow item={item} key={item.id} />
          ))}
        </div>
      )}
      <div className="space-y-3">
        {items.map((item) => (
          <UsageLimitRow item={item} key={item.id} />
        ))}
      </div>
      <p className="text-[0.6875rem]">Monthly limits reset {resetDate}</p>
    </div>
  );
}
