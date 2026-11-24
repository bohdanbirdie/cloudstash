//! A window's toolbar: leading, centre and trailing slots in a band the window drags by.

use rune::{El, SystemMaterial, row, text};

use rune_kit::Kit;

/// The toolbar band's height: 40 points (upstream 48, macOS 26's unified toolbar), so the
/// traffic lights centred in it below an 8 point frame inset sit as far from the window's top
/// as from its side, at (21, 21).
pub const TOOLBAR_HEIGHT: f32 = 40.0;
/// Padding at the band's ends.
const PAD: f32 = 12.0;

/// A toolbar: `Toolbar::new().leading(..).title("..").trailing(..).build(&kit)`. The band is a
/// window drag region (buttons in it keep their presses) and its centre slot sits in the
/// middle of the band whatever the sides hold.
pub struct Toolbar {
    leading: Vec<El>,
    center: Option<El>,
    title: Option<String>,
    trailing: Vec<El>,
    pad: Option<f32>,
    material: Option<SystemMaterial>,
}

impl Toolbar {
    pub fn new() -> Toolbar {
        Toolbar { leading: Vec::new(), center: None, title: None, trailing: Vec::new(), pad: None, material: None }
    }
    pub fn leading(mut self, e: El) -> Self {
        self.leading.push(e);
        self
    }
    pub fn trailing(mut self, e: El) -> Self {
        self.trailing.push(e);
        self
    }
    /// The centre slot. Replaces a [`Toolbar::title`].
    pub fn center(mut self, e: El) -> Self {
        self.center = Some(e);
        self.title = None;
        self
    }
    /// A centred title in the kit's medium UI type.
    pub fn title(mut self, t: impl Into<String>) -> Self {
        self.title = Some(t.into());
        self.center = None;
        self
    }
    /// Backs the band with a system material (macOS blurs what's behind a transparent
    /// window). Elsewhere, and headless, the kit's base background draws instead.
    pub fn material(mut self, m: SystemMaterial) -> Self {
        self.material = Some(m);
        self
    }

    /// The leading padding a `SplitView` works out (traffic lights and its sidebar toggle).
    pub(super) fn padding(mut self, points: f32) -> Self {
        self.pad = Some(points);
        self
    }

    pub fn build(self, k: &Kit) -> El {
        let c = &k.c;
        let pl = self.pad.unwrap_or(PAD);
        let mut band = row().key("toolbar").role("toolbar").w_full().h(TOOLBAR_HEIGHT).pl(pl).pr(PAD).gap(8.0).center_y().window_drag();
        if let Some(t) = &self.title {
            band = band.label(t.clone());
        }
        let center = match (self.center, self.title) {
            (Some(e), _) => Some(e),
            (None, Some(t)) => Some(text(t).key("title").font(k.ty.ui_medium).color(c.text_base).truncate()),
            _ => None,
        };
        if let Some(center) = center {
            // Across the whole band and centred in it, so the sides can differ in width. First,
            // so the side slots draw and take presses above it.
            band = band.child(row().key("center").pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0)).center().px(96.0).child(center));
        }
        band = band
            // The leading slot gives way first, so a long title truncates instead of pushing the
            // trailing controls off the band.
            .child(row().key("leading").gap(4.0).center_y().shrink().min_w(0.0).children(self.leading))
            .child(row().key("spacer").grow(1.0).a11y_hidden())
            .child(row().key("trailing").gap(4.0).center_y().children(self.trailing));
        if let Some(m) = self.material {
            band = band.system_material(m).fill(c.bg_base);
        }
        band
    }
}

impl Default for Toolbar {
    fn default() -> Self {
        Self::new()
    }
}
