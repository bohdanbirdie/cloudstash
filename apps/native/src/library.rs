//! One authenticated read of the signed-in library through Cloudstash's MCP endpoint.

use serde_json::{Value, json};

use crate::auth::{Session, http_json};

/// Titles (or URLs) of the most recently saved links.
pub fn recent_links(resource: &str, session: &Session) -> Result<Vec<String>, String> {
    let response = ureq::post(resource)
        .set("Accept", "application/json, text/event-stream")
        .set("Authorization", &format!("Bearer {}", session.access_token))
        .set("MCP-Protocol-Version", "2025-11-25")
        .send_json(json!({
            "id": 1,
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": { "name": "list_links", "arguments": { "limit": 5 } },
        }));
    let body = match response {
        Ok(r) if r.content_type() == "text/event-stream" => {
            let text = r.into_string().map_err(|e| e.to_string())?;
            let data = text
                .lines()
                .find_map(|line| line.strip_prefix("data: "))
                .ok_or("library response held no event")?;
            serde_json::from_str::<Value>(data).map_err(|e| e.to_string())?
        }
        other => http_json(other).map_err(|e| e.message)?,
    };
    if let Some(message) = body["error"]["message"].as_str() {
        return Err(message.to_owned());
    }
    let text = body["result"]["content"][0]["text"]
        .as_str()
        .ok_or("library response held no content")?;
    if body["result"]["isError"] == true {
        return Err(text.to_owned());
    }
    let value: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    // The tool returns either the links or an object that carries them beside a cursor.
    let links = match &value {
        Value::Array(links) => links.as_slice(),
        Value::Object(fields) => fields
            .values()
            .find_map(Value::as_array)
            .map(Vec::as_slice)
            .ok_or("library response held no links")?,
        _ => return Err("library response held no links".to_owned()),
    };
    Ok(links
        .iter()
        .filter_map(|link| {
            ["title", "url"]
                .iter()
                .find_map(|field| link[field].as_str().filter(|s| !s.is_empty()))
                .map(str::to_owned)
        })
        .collect())
}
