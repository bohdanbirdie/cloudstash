//! Downloading a picture: one shared client, a time limit, and a size limit checked before and
//! while the body arrives, so an oversized file is dropped rather than read whole.

use std::sync::OnceLock;
use std::time::Duration;

const MAX_BYTES: usize = 12 * 1024 * 1024;

pub fn client() -> reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| reqwest::Client::builder().timeout(Duration::from_secs(15)).user_agent("Cloudstash").build().expect("http client")).clone()
}

/// Why a download gave nothing: `Gone` will fail the same way again (missing, refused, too
/// big), `Later` might not (offline, timed out, the site overloaded).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Miss {
    Gone,
    Later,
}

pub async fn get(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, Miss> {
    let response = client.get(url).send().await.map_err(|e| if e.is_builder() { Miss::Gone } else { Miss::Later })?;
    let status = response.status();
    if status.is_server_error() || status == reqwest::StatusCode::REQUEST_TIMEOUT || status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(Miss::Later);
    }
    let mut response = response.error_for_status().map_err(|_| Miss::Gone)?;
    if response.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
        return Err(Miss::Gone);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| Miss::Later)? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return Err(Miss::Gone);
        }
    }
    Ok(body)
}
