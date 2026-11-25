//! The web's icons: lucide's LoaderCircle, TriangleAlert, Settings and ArrowUp (lucide-react 1.34.0, 24-unit
//! grid, 2-unit round strokes) and Cloudstash's logo.

use rune::Icon;

macro_rules! lucide {
    ($name:literal, $paths:literal) => {
        Icon {
            name: $name,
            view: 24.0,
            body: concat!(r#"<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">"#, $paths, "</g>"),
        }
    };
}

pub static LOADER_CIRCLE: Icon = lucide!("lucide-loader-circle", r#"<path d="M21 12a9 9 0 1 1-6.219-8.56"/>"#);
pub static ARROW_UP: Icon = lucide!("lucide-arrow-up", r#"<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>"#);
pub static TRIANGLE_ALERT: Icon = lucide!(
    "lucide-triangle-alert",
    r#"<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>"#
);

pub static SETTINGS: Icon = lucide!(
    "lucide-settings",
    r#"<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>"#
);

/// The logo on its own, in one colour: the ball of dots. Made by scripts/brand.py.
pub static LOGO: Icon = Icon { name: "cloudstash-logo", view: 120.0, body: include_str!("../assets/brand/logo-mark.body.svg") };

/// The app icon's tile in its own colours, as the Dock shows it. Made by scripts/brand.py.
pub static LOGO_TILE: Icon = Icon { name: "cloudstash-logo-tile", view: 824.0, body: include_str!("../assets/brand/logo-tile.body.svg") };
