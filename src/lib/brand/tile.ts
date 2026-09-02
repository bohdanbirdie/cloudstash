const WHITE = 255;
const FILL_BOTTOM = [247, 247, 249];
const EDGE_TOP = [239, 239, 242];
const EDGE_BOTTOM = [227, 227, 232];

const TILE_REFERENCE_PX = 96;
const FILL_BOOST_MAX = 2;
const EDGE_BOOST_MAX = 1.6;
const VIEWBOX_PX = 120;

export const TILE_FILL_TOP = "#ffffff";
export const TILE_INK = "#18181b";

function deepen(base: number[], boost: number): string {
  return `#${base
    .map((v) =>
      Math.round(WHITE - (WHITE - v) * boost)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

// Below the reference size the gradient deepens and the rim keeps at least
// one device pixel, so a small tile reads with the depth of the 96px design.
export function tileDepth(tilePx: number): {
  fillBottom: string;
  edgeTop: string;
  edgeBottom: string;
  rimViewbox: number;
} {
  const boost = Math.min(
    FILL_BOOST_MAX,
    Math.max(1, TILE_REFERENCE_PX / tilePx)
  );
  const edgeBoost = Math.min(EDGE_BOOST_MAX, boost);
  return {
    fillBottom: deepen(FILL_BOTTOM, boost),
    edgeTop: deepen(EDGE_TOP, edgeBoost),
    edgeBottom: deepen(EDGE_BOTTOM, edgeBoost),
    rimViewbox: Math.max(1, VIEWBOX_PX / tilePx),
  };
}
