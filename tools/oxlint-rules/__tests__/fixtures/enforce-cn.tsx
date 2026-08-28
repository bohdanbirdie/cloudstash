import { cn } from "@/lib/utils";

const active = true;
const externalClassName = "external";

export function Cases() {
  return (
    <div>
      <span className="base" />
      <span className={externalClassName} />
      <span className={externalClassName || "fallback"} />
      <span className={externalClassName ?? "fallback"} />
      <span className={cn("base", { active })} />

      <span className={`base ${externalClassName}`} />
      <span className={"base " + externalClassName} />
      <span className={active ? "active" : "inactive"} />
      <span className={active && "active"} />

      <span className={cn("base", active ? "active" : "inactive")} />
      <span className={cn("base", active ? "active" : "")} />
      <span className={cn("base", active && "active")} />
      <span className={cn("base", `prefix ${externalClassName}`)} />
      <span className={cn("base", "prefix " + externalClassName)} />
    </div>
  );
}
