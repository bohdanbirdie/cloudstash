#!/usr/bin/env python3
"""Draws Cloudstash's logo and writes every file made from it.

  python3 scripts/brand.py            # rewrite the SVGs
  python3 scripts/brand.py --raster   # also rebuild AppIcon.icns and menu-bar-icon.png (needs Google Chrome)
  python3 scripts/brand.py --web      # also rebuild the website's icons in public/ (needs Google Chrome)

The logo is a ball of dots. The Mac app icon rests it in a round well on a black tile. Inside the app, src/sphere.rs draws the
same shapes itself. The SVGs in assets/brand/ are the originals; the .icns and .png are made from them and never edited by hand.
"""
import math, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "..", "assets")
BRAND = os.path.join(ASSETS, "brand")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

f = lambda n: ("%.2f" % n).rstrip("0").rstrip(".")


def squircle(x, y, s, r):
    """Apple's continuous-corner rounded square: side s, corner r, top-left at x, y."""
    A, B, C, E, F, G, H = [v * r for v in (1.52866483, 1.08849296, 0.86840694, 0.63149399, 0.074911, 0.37282392, 0.16905899)]
    P = lambda a, b: f(x + a) + " " + f(y + b)
    return (
        "M" + P(A, 0) + "L" + P(s - A, 0) + "C" + P(s - B, 0) + " " + P(s - C, 0) + " " + P(s - E, F) + "C" + P(s - G, H) + " " + P(s - H, G) + " " + P(s - F, E)
        + "C" + P(s, C) + " " + P(s, B) + " " + P(s, A) + "L" + P(s, s - A) + "C" + P(s, s - B) + " " + P(s, s - C) + " " + P(s - F, s - E)
        + "C" + P(s - H, s - G) + " " + P(s - G, s - H) + " " + P(s - E, s - F) + "C" + P(s - C, s) + " " + P(s - B, s) + " " + P(s - A, s)
        + "L" + P(A, s) + "C" + P(B, s) + " " + P(C, s) + " " + P(E, s - F) + "C" + P(G, s - H) + " " + P(H, s - G) + " " + P(F, s - E)
        + "C" + P(0, s - C) + " " + P(0, s - B) + " " + P(0, s - A) + "L" + P(0, A) + "C" + P(0, B) + " " + P(0, C) + " " + P(F, E)
        + "C" + P(H, G) + " " + P(G, H) + " " + P(E, F) + "C" + P(C, 0) + " " + P(B, 0) + " " + P(A, 0) + "Z"
    )


def sphere(cx, cy, R, n, base, fill, floor):
    """The front half of a ball of n evenly spread dots, tilted and lit from the top left."""
    light, turn, tilt = (-0.42, -0.62, 0.66), 2.39996, 0.5
    out = []
    for i in range(n):
        y0 = 1 - 2 * (i + 0.5) / n
        rr = math.sqrt(1 - y0 * y0)
        x, z0 = rr * math.cos(i * turn), rr * math.sin(i * turn)
        y, z = y0 * math.cos(tilt) - z0 * math.sin(tilt), y0 * math.sin(tilt) + z0 * math.cos(tilt)
        if z < 0.04:
            continue
        lit = max(0.0, x * light[0] + y * light[1] + z * light[2])
        out.append('<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' % (f(cx + R * x), f(cy + R * y), f(base * (0.3 + 0.7 * z)), fill, f(floor + (1 - floor) * lit**1.15)))
    return "".join(out)


def tile(shadow, n=150, base=2.5, floor=0.1):
    """The app icon on Apple's 1024 grid: an 824 tile with a 185.4 corner."""
    k = 1024 / 120 * (824 / 1024 * 120 / 108)  # the mark was drawn in a 108-unit tile
    well = lambda r, g: (
        '<circle cx="512" cy="%s" r="%s" fill="#fff" opacity=".13"/>' % (f(512 + 1.1 * k), f(r * k))
        + '<circle cx="512" cy="%s" r="%s" fill="#000" opacity=".5"/>' % (f(512 - 0.7 * k), f(r * k))
        + '<circle cx="512" cy="512" r="%s" fill="url(#%s)"/>' % (f(r * k), g)
    )
    lg = lambda i, a, b: '<linearGradient id="%s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient>' % (i, a, b)
    shape = squircle(100, 100, 824, 185.4)
    return (
        "<defs>" + lg("cs-t", "#2c2c30", "#0c0c0d") + lg("cs-w0", "#060607", "#19191c") + lg("cs-w1", "#030304", "#121214")
        + '<linearGradient id="cs-e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        + '<radialGradient id="cs-g"><stop offset="0" stop-color="#fff" stop-opacity=".15"/><stop offset=".4" stop-color="#fff" stop-opacity=".11"/><stop offset=".75" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
        + ('<filter id="cs-s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="10"/></filter>' if shadow else "")
        + "</defs>"
        + ('<path d="%s" fill="#000" opacity=".3" filter="url(#cs-s)" transform="translate(0 10)"/>' % shape if shadow else "")
        + '<path d="%s" fill="url(#cs-t)"/>' % shape
        + well(43, "cs-w0") + well(33, "cs-w1")
        + '<circle cx="512" cy="512" r="%s" fill="url(#cs-g)"/>' % f(24 * k * 1.35)
        + sphere(512, 512, 24 * k, n, base * k, "#fff", floor)
        + '<path d="%s" fill="none" stroke="url(#cs-e)" stroke-width="8.5"/>' % squircle(104.25, 104.25, 815.5, 815.5 * 0.225)
    )


def mark(n, base, floor):
    """The logo on its own, in one colour: the ball without the tile and the well."""
    return sphere(60, 60, 56, n, base, "currentColor", floor)


svg = lambda size, view, body: '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="%s">%s</svg>\n' % (size, size, view, body)

FILES = {
    # The originals.
    "app-icon.svg": svg(1024, "0 0 1024 1024", tile(True)),
    # The same ball as the app icon's. The menu bar's has fewer, bigger dots so it survives 18 points.
    "logo-mark.svg": svg(120, "0 0 120 120", mark(150, 5.83, 0.1)),
    "menu-bar-icon.svg": svg(18, "0 0 120 120", mark(44, 10.5, 0.3)),
}


def shot(src, px, out):
    """Draws an SVG at px by px with a clear background."""
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "p.html")
        open(page, "w").write('<body style="margin:0;background:transparent"><img src="file://%s" style="display:block;width:%dpx;height:%dpx">' % (os.path.abspath(src), px, px))
        for _ in range(3):
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--default-background-color=00000000",
                            "--user-data-dir=" + os.path.join(tmp, "prof"), "--window-size=%d,%d" % (px, px), "--screenshot=" + out, "file://" + page],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if os.path.exists(out):
                return
        sys.exit("Chrome did not draw " + src)


def raster():
    with tempfile.TemporaryDirectory() as tmp:
        big = os.path.join(tmp, "1024.png")
        shot(os.path.join(BRAND, "app-icon.svg"), 1024, big)
        iconset = os.path.join(tmp, "AppIcon.iconset")
        os.mkdir(iconset)
        for pt in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                name = "icon_%dx%d%s.png" % (pt, pt, "@2x" if scale == 2 else "")
                subprocess.run(["sips", "-z", str(pt * scale), str(pt * scale), big, "--out", os.path.join(iconset, name)], check=True, stdout=subprocess.DEVNULL)
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(ASSETS, "AppIcon.icns")], check=True)
        # The menu bar icon is 18 points at 2x; drawn large first because Chrome's window can't be 36 wide.
        menu = os.path.join(tmp, "menu.png")
        shot(os.path.join(BRAND, "menu-bar-icon.svg"), 576, menu)
        subprocess.run(["sips", "-z", "36", "36", menu, "--out", os.path.join(ASSETS, "menu-bar-icon.png")], check=True, stdout=subprocess.DEVNULL)


def web():
    """The website's icons in public/: the app icon, with the simpler ball where it is small."""
    public = os.path.join(HERE, "..", "..", "..", "public")
    # The same icon; only the ball is the cut with fewer, bigger dots, as in the menu bar.
    small = svg(1024, "100 100 824 824", tile(False, 44, 2.5 * 10.5 / 5.83, 0.3))
    # A phone rounds the corners itself, so its icon fills the square.
    full = svg(1024, "100 100 824 824", '<rect x="100" y="100" width="824" height="824" fill="#0c0c0d"/>' + tile(False))
    with tempfile.TemporaryDirectory() as tmp:
        for name, text, sizes in (("small", small, {16: ["favicon-16x16.png"], 32: ["favicon-32x32.png", "favicon.ico"]}),
                                  ("full", full, {180: ["apple-touch-icon.png"]}),
                                  ("icon", svg(1024, "100 100 824 824", tile(False)), {192: ["logo192.png"], 512: ["logo512.png"]})):
            src, big = os.path.join(tmp, name + ".svg"), os.path.join(tmp, name + ".png")
            open(src, "w").write(text)
            shot(src, 1024, big)
            for px, outs in sizes.items():
                for out in outs:
                    subprocess.run(["sips", "-z", str(px), str(px), big, "--out", os.path.join(public, out)], check=True, stdout=subprocess.DEVNULL)


os.makedirs(BRAND, exist_ok=True)
for name, text in FILES.items():
    open(os.path.join(BRAND, name), "w").write(text)
if "--raster" in sys.argv:
    raster()
if "--web" in sys.argv:
    web()
