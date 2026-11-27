//! A fork of rune-kit's `SplitView` shell (rune 86b903d: `crates/rune-kit/src/shell/{split,pane,toolbar}.rs`
//! and `grip.rs`), for what the kit keeps private. Changes from upstream:
//!
//! - A peeking sidebar is a rounded card at the window's inset, like the content card, over an
//!   optional scrim (`SidebarPeek::scrim`), instead of a flush full-height surface.
//! - Pulling the sidebar's edge past its minimum gives a little (`PaneState::pull`) and fades
//!   its contents, so collapsing continues the pull on the pane's spring; the trackpad taps
//!   faster the harder it pulls, and once more as it collapses.
//! - The sidebar's grip is 12 points wide and straddles its edge, and a line marks the edge while
//!   the pointer rests on it (and in the accent colour while it's dragged).
//! - Pulled past its maximum, the sidebar stretches like a rubber band (up to 36 points) and
//!   springs back on release; its edge line shows after the pointer rests 700 ms.
//! - At its maximum width the edge shows AppKit's left-only resize cursor.
//! - Toggling the sidebar (⌘B) mid-drag ends the drag first.
//! - Closing the sidebar with its toggle doesn't peek it until the pointer leaves the toggle.
//! - The toolbar band is 40 points, so the traffic lights sit evenly in the corner.
//!
//! The rest is upstream as is, the inspector and `Page` included, so it diffs cleanly.
#![allow(dead_code, clippy::derivable_impls)]

mod grip;
mod mac;
mod pane;
mod split;
mod toolbar;

pub use pane::{PaneState, SidebarPeek, is_sidebar_toggle, pressed};
pub use split::{SidebarToggle, SplitView};
pub use toolbar::{TOOLBAR_HEIGHT, Toolbar};

use rune::Icon;

/// The sidebar toggle's glyph: a window with its leading pane drawn in.
pub static SIDEBAR: Icon = Icon {
    name: "kit-sidebar",
    view: 16.0,
    body: r#"<rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1" fill="none"/><path d="M6 3.5V12.5" stroke="currentColor" stroke-width="1"/>"#,
};
