// macOS-style squircle via superellipse: |x|^n + |y|^n = r^n

export function squirclePath(
  cx: number,
  cy: number,
  size: number,
  n = 5
): string {
  const parts: string[] = [];
  const steps = 400;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const cosT = Math.cos(t);
    const sinT = Math.sin(t);
    const x = cx + size * Math.sign(cosT) * Math.abs(cosT) ** (2 / n);
    const y = cy + size * Math.sign(sinT) * Math.abs(sinT) ** (2 / n);
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return parts.join(" ") + " Z";
}
