import { sphereDots, SPHERE_FINE, SPHERE_SMALL } from "@/lib/brand/sphere";
import { squirclePath } from "@/lib/brand/squircle";

const SQUIRCLE_D = squirclePath(60, 60, 52, 5);
// The app icon was drawn in a 108-unit tile; here the tile is 104 wide.
const UNIT = 104 / 108;

function Ball({
  cx,
  cy,
  radius,
  detail,
  fill,
}: {
  cx: number;
  cy: number;
  radius: number;
  detail: "small" | "fine";
  fill: string;
}) {
  const cut = detail === "fine" ? SPHERE_FINE : SPHERE_SMALL;
  const base = (cut.base * radius) / 56;
  return (
    <>
      {sphereDots(cut.count, cut.floor).map((dot, i) => (
        <circle
          // oxlint-disable-next-line react/no-array-index-key -- the dots never reorder
          key={i}
          cx={cx + radius * dot.x}
          cy={cy + radius * dot.y}
          r={base * dot.size}
          fill={fill}
          opacity={dot.opacity}
        />
      ))}
    </>
  );
}

/**
 * The logo is the ball of dots alone (`plain`). `branded` is the app icon: the ball on the
 * black tile, always with its well. `detail="fine"` draws every dot, for sizes from about 40px.
 */
export function CloudstashLogo({
  className,
  variant = "plain",
  detail = "small",
}: {
  className?: string;
  variant?: "plain" | "branded";
  detail?: "small" | "fine";
}) {
  if (variant === "branded") {
    return <BrandedLogo className={className} detail={detail} />;
  }

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <Ball cx={60} cy={60} radius={56} detail={detail} fill="currentColor" />
    </svg>
  );
}

function Well({ r, from, to }: { r: number; from: string; to: string }) {
  const id = `cs-well-${r}`;
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <circle
        cx={60}
        cy={60 + 1.1 * UNIT}
        r={r * UNIT}
        fill="#fff"
        opacity={0.13}
      />
      <circle
        cx={60}
        cy={60 - 0.7 * UNIT}
        r={r * UNIT}
        fill="#000"
        opacity={0.5}
      />
      <circle cx={60} cy={60} r={r * UNIT} fill={`url(#${id})`} />
    </>
  );
}

function BrandedLogo({
  className,
  detail,
}: {
  className?: string;
  detail: "small" | "fine";
}) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cs-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2c30" />
          <stop offset="1" stopColor="#0c0c0d" />
        </linearGradient>
      </defs>
      <path d={SQUIRCLE_D} fill="url(#cs-tile)" />
      <Well r={43} from="#060607" to="#19191c" />
      <Well r={33} from="#030304" to="#121214" />
      <Ball cx={60} cy={60} radius={24 * UNIT} detail={detail} fill="#fff" />
    </svg>
  );
}
