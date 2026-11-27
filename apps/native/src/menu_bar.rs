//! The menu bar icon: the logo as a template image, which macOS tints to match the menu bar.
//! Cloudstash Dev's is a blue ball, left as drawn so it stays blue.
//! Clicking it brings the window forward. It shows while `State::menu_bar` is on.

use std::sync::Mutex;

use rune::AppHandle;
use tray_icon::{Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};

use crate::State;

/// The logo, black (Dev: blue) on clear, 18 points at 2x.
const PICTURE: &[u8] =
    if crate::flavor::DEV { include_bytes!("../assets/menu-bar-icon-dev.png") } else { include_bytes!("../assets/menu-bar-icon.png") };

/// Puts the icon in the menu bar; it goes when the returned value is dropped.
pub fn show(ui: AppHandle<State>) -> Option<TrayIcon> {
    let picture = image::load_from_memory(PICTURE).ok()?.into_rgba8();
    let (width, height) = picture.dimensions();
    let icon = Icon::from_rgba(picture.into_raw(), width, height).ok()?;
    let ui = Mutex::new(ui);
    TrayIconEvent::set_event_handler(Some(move |event| {
        if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event
            && let Ok(ui) = ui.lock()
        {
            ui.open();
        }
    }));
    let builder = TrayIconBuilder::new();
    let builder = if crate::flavor::DEV { builder.with_icon(icon) } else { builder.with_icon_templated(icon) };
    builder.with_tooltip(crate::flavor::identity().name.as_str()).build().inspect_err(|e| tracing::warn!("could not add the menu bar icon: {e}")).ok()
}
