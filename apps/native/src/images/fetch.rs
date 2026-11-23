//! Downloading a picture: one shared client, a time limit, and a size limit checked before and
//! while the body arrives, so an oversized file is dropped rather than read whole.

use std::sync::OnceLock;
use std::time::Duration;

const MAX_BYTES: usize = 12 * 1024 * 1024;

pub fn client() -> reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| reqwest::Client::builder().timeout(Duration::from_secs(15)).user_agent("Cloudstash").build().expect("http client")).clone()
}

pub async fn get(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    let mut response = client.get(url).send().await.ok()?.error_for_status().ok()?;
    if response.content_length().is_some_and(|n| n > MAX_BYTES as u64) {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > MAX_BYTES {
            return None;
        }
    }
    Some(body)
}
