//! Open at login: the app as a macOS login item (SMAppService), listed in System Settings →
//! General → Login Items. macOS keeps the setting, so ui.json doesn't. It needs a signed app:
//! a dev build may not register.

use smappservice_rs::{AppService, ServiceStatus, ServiceType};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Login {
    #[default]
    Off,
    On,
    /// Registered, but turned off in Login Items until the person allows it there.
    NeedsApproval,
}

/// Whether the app opens at login, as macOS has it now.
pub fn state() -> Login {
    match AppService::new(ServiceType::MainApp).status() {
        ServiceStatus::Enabled => Login::On,
        ServiceStatus::RequiresApproval => Login::NeedsApproval,
        ServiceStatus::NotRegistered | ServiceStatus::NotFound => Login::Off,
    }
}

/// Turns opening at login on or off, and returns how macOS has it afterwards.
pub fn set(on: bool) -> Login {
    let service = AppService::new(ServiceType::MainApp);
    let done = if on { service.register() } else { service.unregister() };
    if let Err(e) = done {
        tracing::warn!(on, "could not change open at login: {e}");
    }
    state()
}
