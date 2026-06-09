import { clsx } from "clsx";

import { cn } from "@/lib/utils";

const inverted = true;
const flag = "x";
const plan = { inverted: true };
const styles = { a: "sa" };

export function Cases() {
  return (
    <div>
      <span className={cn("base", inverted ? "a" : "b")} />
      <span className={cn("base", plan.inverted ? "a" : "b")} />
      <span className={cn("base", flag === "x" ? "a" : "b")} />
      <span className={cn("base", !inverted ? "a" : "b")} />
      <span className={clsx(inverted ? "a" : "b")} />

      <span className={cn("base", inverted && "a")} />
      <span className={cn("base", { a: inverted })} />
      <span className={inverted ? "a" : "b"} />
      <span className={cn("base", inverted ? "a" : "")} />
      <span className={cn("base", inverted ? styles.a : "b")} />
    </div>
  );
}
