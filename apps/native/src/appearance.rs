//! The app's theme: macOS's own appearance, or light or dark whatever it is. It's set on the
//! application, so both windows, their menus and `Cx::system_dark` follow it.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
}

/// Each theme's name in `ui.json` and in Settings.
pub const THEMES: [(Theme, &str, &str); 3] =
    [(Theme::System, "system", "Follow System"), (Theme::Light, "light", "Light"), (Theme::Dark, "dark", "Dark")];

/// Gives the app `theme`'s appearance. Call it on the main thread once the app is running:
/// winit makes the application object itself.
#[cfg(target_os = "macos")]
pub fn apply(theme: Theme) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSAppearance, NSApplication};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let name = match theme {
        Theme::System => None,
        Theme::Light => Some("NSAppearanceNameAqua"),
        Theme::Dark => Some("NSAppearanceNameDarkAqua"),
    };
    let appearance = name.and_then(|name| NSAppearance::appearanceNamed(&NSString::from_str(name)));
    NSApplication::sharedApplication(mtm).setAppearance(appearance.as_deref());
}

#[cfg(not(target_os = "macos"))]
pub fn apply(_: Theme) {}
