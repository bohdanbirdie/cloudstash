# Chrome Web Store assets

Source-of-truth listing assets uploaded to the [CWS dashboard](https://chrome.google.com/webstore/devconsole).
Tracked in git (not build output). See `docs/todos/chrome-extension-publishing.md` §2/§5
and `docs/todos/chrome-extension-listing-copy.md` for the listing text.

## Marketing tiles (generated)

Export from the **Chrome Web Store** section of the `/brand` page (admin only) → "Save PNG".
Filenames come out as `cloudstash-cws-<w>x<h>.png`.

| File                          | Size     | CWS slot                          |
| ----------------------------- | -------- | --------------------------------- |
| `cloudstash-cws-440x280.png`  | 440×280  | Small promo tile                  |
| `cloudstash-cws-1400x560.png` | 1400×560 | Marquee promo tile                |
| `cloudstash-cws-1280x800.png` | 1280×800 | Branded promo / screenshot filler |

## Screenshots (manual capture — required, ≥1, max 5)

Must be **exactly 1280×800** (or 640×400), PNG. The popup is ~714px wide, so it
can't BE a screenshot directly — composite the popup capture onto a 1280×800
backdrop (centered, dark/branded background).

- `screenshot-1-connect.png` — popup connect screen
- `screenshot-2-save.png` — popup save flow (recent links w/ favicons + avatar in identity row)
- `screenshot-3-web-connect.png` — the `/connect/extension` page on the web app

### On hand

- `screenshot-1-save.png` — **upload-ready, 1280×800.** Browser + popup in context,
  cropped from `app.png`. Dev-state content (empty inbox, localhost URL) accepted
  by choice — the extension isn't a new-user funnel. Toolbar is slightly clipped
  and there's bottom whitespace; cosmetic only.
- `app.png` — 2400×1600 source capture for the above (browser + popup).
- `extension.png` — popup-only capture (714×606). Not upload-ready as-is; usable as
  the source for a framed 1280×800 composite if a cleaner shot is wanted later.

## Icons

Live in `apps/extension/public/icon/{16,32,48,128}.png` (WXT auto-wires them into the
manifest). Not duplicated here.
